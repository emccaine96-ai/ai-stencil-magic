import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  ChevronLeft, Save, Undo2, Redo2, Eye, EyeOff, Lock, Unlock, Plus, Trash2,
  Layers as LayersIcon, Brush as BrushIcon, Download, ChevronUp, ChevronDown,
} from "lucide-react";
import {
  getDocument, saveDocument, makeThumbnail,
  type DocumentData, type LayerState, type BlendMode, type EditorState,
} from "@/lib/localDB";
import { v4 as uuidv4 } from "uuid";
import { InputSmoother, estimatePressureFromVelocity, type SmoothedPoint } from "@/lib/kalman";
import { beginStroke, endStroke, strokeTo, DEFAULTS, BRUSH_LABELS, type BrushId, type BrushSettings, type StrokeContext } from "@/lib/brushes";

export const Route = createFileRoute("/studio/$docId")({
  head: () => ({
    meta: [
      { title: "PrimalCanvas Studio — PrimalPrint AI" },
      { name: "description", content: "Procreate-inspired stencil editor: pressure-sensitive brushes, layers, blend modes, version history. Built for Android." },
    ],
  }),
  component: StudioPage,
});

const CANVAS_W = 1536;
const CANVAS_H = 1536;
const AUTOSAVE_MS = 25_000;

const BLEND_MODES: BlendMode[] = [
  "normal", "multiply", "screen", "overlay", "soft-light", "hard-light",
  "color-dodge", "color-burn", "darken", "lighten", "difference", "exclusion",
  "hue", "saturation", "color", "luminosity",
];

// History entry: snapshot of the active layer's bitmap before a stroke.
type HistoryEntry = { layerId: string; before: ImageData; after: ImageData };

function StudioPage() {
  const { docId } = useParams({ from: "/studio/$docId" });
  const navigate = useNavigate();

  const [doc, setDoc] = useState<DocumentData | null>(null);
  const [state, setState] = useState<EditorState | null>(null);
  const [activeBrushId, setActiveBrushId] = useState<BrushId>("hard-round");
  const [brushOverrides, setBrushOverrides] = useState<Partial<BrushSettings>>({});
  const [color, setColor] = useState("#111111");
  const [smoothing, setSmoothing] = useState(0.45);
  const [pressure, setPressure] = useState(0);
  const [showLayers, setShowLayers] = useState(true);
  const [showBrushes, setShowBrushes] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const composedRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // layerId -> offscreen canvas
  const layerCanvases = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const smootherRef = useRef(new InputSmoother());
  const strokeRef = useRef<{ sc: StrokeContext; prev: SmoothedPoint | null; before: ImageData } | null>(null);
  const historyRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);

  const brush: BrushSettings = useMemo(() => ({
    ...DEFAULTS[activeBrushId],
    ...brushOverrides,
    color: activeBrushId === "eraser" ? "#000000" : color,
  }), [activeBrushId, brushOverrides, color]);

  /* ---------- Load document ---------- */

  useEffect(() => {
    let alive = true;
    (async () => {
      const d = await getDocument(docId);
      if (!alive) return;
      if (!d) { navigate({ to: "/vault" }); return; }
      setDoc(d);
      const initial = await ensureEditorState(d);
      if (!alive) return;
      // Build offscreen layer canvases
      for (const layer of initial.layers) {
        const c = await dataUrlToCanvas(layer.dataUrl, initial.width, initial.height);
        layerCanvases.current.set(layer.id, c);
      }
      setState(initial);
    })();
    return () => { alive = false; };
  }, [docId, navigate]);

  /* ---------- Render composite ---------- */

  const compose = useCallback(() => {
    const cv = composedRef.current; if (!cv || !state) return;
    const ctx = cv.getContext("2d")!;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    for (const layer of state.layers) {
      if (!layer.visible) continue;
      const lc = layerCanvases.current.get(layer.id); if (!lc) continue;
      ctx.globalAlpha = layer.opacity;
      ctx.globalCompositeOperation = layer.blendMode as GlobalCompositeOperation;
      ctx.drawImage(lc, 0, 0);
    }
    ctx.restore();
  }, [state]);

  useEffect(() => { compose(); }, [compose]);

  useEffect(() => {
    smootherRef.current.setSmoothing(smoothing);
  }, [smoothing]);

  /* ---------- Pointer handlers ---------- */

  function canvasCoords(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const cv = composedRef.current!;
    const r = cv.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * CANVAS_W,
      y: ((e.clientY - r.top) / r.height) * CANVAS_H,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!state) return;
    const layer = state.layers.find(l => l.id === state.activeLayerId);
    if (!layer || layer.locked) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const lc = layerCanvases.current.get(layer.id); if (!lc) return;
    const lctx = lc.getContext("2d")!;
    smootherRef.current.reset();
    smootherRef.current.setSmoothing(smoothing);
    const { x, y } = canvasCoords(e);
    const rawPressure = e.pressure > 0 && e.pointerType !== "mouse" ? e.pressure : estimatePressureFromVelocity(null, x, y, e.timeStamp);
    const sp = smootherRef.current.push(x, y, rawPressure, e.timeStamp);
    setPressure(sp.pressure);
    const sc = beginStroke(lctx, brush);
    if (layer.alphaLock && brush.id !== "eraser") {
      lctx.globalCompositeOperation = "source-atop";
    }
    const before = lctx.getImageData(0, 0, lc.width, lc.height);
    strokeRef.current = { sc, prev: sp, before };
    strokeTo(sc, sp.x, sp.y, sp.pressure);
    compose();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const s = strokeRef.current; if (!s) return;
    const { x, y } = canvasCoords(e);
    const evts = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
    for (const ev of evts) {
      const cx = ((ev.clientX - composedRef.current!.getBoundingClientRect().left) / composedRef.current!.getBoundingClientRect().width) * CANVAS_W;
      const cy = ((ev.clientY - composedRef.current!.getBoundingClientRect().top) / composedRef.current!.getBoundingClientRect().height) * CANVAS_H;
      const rawPressure = (ev as PointerEvent).pressure > 0 && (ev as PointerEvent).pointerType !== "mouse"
        ? (ev as PointerEvent).pressure
        : estimatePressureFromVelocity(s.prev, cx, cy, ev.timeStamp);
      const sp = smootherRef.current.push(cx, cy, rawPressure, ev.timeStamp);
      strokeTo(s.sc, sp.x, sp.y, sp.pressure);
      s.prev = sp;
      setPressure(sp.pressure);
    }
    // also commit the final native point
    if (!evts.length) {
      const sp = smootherRef.current.push(x, y, e.pressure || 0.5, e.timeStamp);
      strokeTo(s.sc, sp.x, sp.y, sp.pressure);
      s.prev = sp;
    }
    compose();
  }

  function onPointerUp() {
    const s = strokeRef.current; if (!s || !state) return;
    endStroke(s.sc);
    const layer = state.layers.find(l => l.id === state.activeLayerId);
    if (layer) {
      const lc = layerCanvases.current.get(layer.id);
      if (lc) {
        const after = lc.getContext("2d")!.getImageData(0, 0, lc.width, lc.height);
        historyRef.current.push({ layerId: layer.id, before: s.before, after });
        if (historyRef.current.length > 60) historyRef.current.shift();
        futureRef.current = [];
      }
    }
    strokeRef.current = null;
    setDirty(true);
  }

  /* ---------- Undo / redo ---------- */

  function undo() {
    const h = historyRef.current.pop(); if (!h) return;
    const lc = layerCanvases.current.get(h.layerId); if (!lc) return;
    lc.getContext("2d")!.putImageData(h.before, 0, 0);
    futureRef.current.push(h);
    compose();
    setDirty(true);
  }
  function redo() {
    const h = futureRef.current.pop(); if (!h) return;
    const lc = layerCanvases.current.get(h.layerId); if (!lc) return;
    lc.getContext("2d")!.putImageData(h.after, 0, 0);
    historyRef.current.push(h);
    compose();
    setDirty(true);
  }

  /* ---------- Layer ops ---------- */

  function addLayer() {
    if (!state) return;
    const id = uuidv4();
    const c = document.createElement("canvas");
    c.width = state.width; c.height = state.height;
    layerCanvases.current.set(id, c);
    const newLayer: LayerState = {
      id, name: `Layer ${state.layers.length + 1}`, visible: true, locked: false,
      alphaLock: false, clipping: false, opacity: 1, blendMode: "normal", dataUrl: "",
    };
    setState({ ...state, layers: [...state.layers, newLayer], activeLayerId: id });
    setDirty(true);
  }

  function deleteLayer(id: string) {
    if (!state || state.layers.length <= 1) return;
    layerCanvases.current.delete(id);
    const layers = state.layers.filter(l => l.id !== id);
    setState({ ...state, layers, activeLayerId: layers[0].id });
    setDirty(true);
  }

  function updateLayer(id: string, patch: Partial<LayerState>) {
    if (!state) return;
    setState({ ...state, layers: state.layers.map(l => l.id === id ? { ...l, ...patch } : l) });
    setDirty(true);
  }

  function moveLayer(id: string, dir: -1 | 1) {
    if (!state) return;
    const i = state.layers.findIndex(l => l.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= state.layers.length) return;
    const layers = [...state.layers];
    [layers[i], layers[j]] = [layers[j], layers[i]];
    setState({ ...state, layers });
    setDirty(true);
  }

  /* ---------- Save / autosave ---------- */

  const save = useCallback(async (changes: string) => {
    if (!doc || !state || saving) return;
    setSaving(true);
    try {
      // Serialise layers + grab thumbnail
      const layers = state.layers.map(l => ({
        ...l, dataUrl: layerCanvases.current.get(l.id)?.toDataURL("image/png") ?? "",
      }));
      const composed = composedRef.current!.toDataURL("image/png");
      const thumb = await makeThumbnail(composed);
      const editorJson = JSON.stringify({ ...state, layers } satisfies EditorState);
      const next = await saveDocument(
        { ...doc, thumbnail: thumb, layeredEditorData: editorJson },
        { changes, thumbnail: thumb, editorState: editorJson },
      );
      setDoc(next);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [doc, state, saving]);

  useEffect(() => {
    if (!dirty) return;
    const id = setTimeout(() => { save("Autosave"); }, AUTOSAVE_MS);
    return () => clearTimeout(id);
  }, [dirty, save]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); save("Manual save"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  function downloadPng() {
    const a = document.createElement("a");
    a.href = composedRef.current!.toDataURL("image/png");
    a.download = `${doc?.name ?? "stencil"}.png`;
    a.click();
  }

  /* ---------- Render ---------- */

  if (!doc || !state) {
    return <div className="min-h-screen bg-background text-foreground grid place-items-center text-sm text-muted-foreground">Loading editor…</div>;
  }

  const activeLayer = state.layers.find(l => l.id === state.activeLayerId)!;

  return (
    <div className="min-h-screen h-screen flex flex-col bg-background text-foreground overflow-hidden touch-none">
      {/* Top bar */}
      <header className="shrink-0 bg-card border-b border-border h-12 flex items-center px-2 gap-1 sm:gap-2 text-xs">
        <Link to="/vault" className="flex items-center gap-1 px-2 py-1 rounded hover:bg-muted">
          <ChevronLeft size={14} /> <span className="hidden sm:inline">Vault</span>
        </Link>
        <input
          value={doc.name}
          onChange={(e) => setDoc({ ...doc, name: e.target.value })}
          onBlur={() => save("Renamed")}
          className="flex-1 min-w-0 bg-transparent border-0 outline-none font-semibold truncate text-sm"
        />
        <button onClick={undo} className="p-1.5 rounded hover:bg-muted" aria-label="Undo"><Undo2 size={14} /></button>
        <button onClick={redo} className="p-1.5 rounded hover:bg-muted" aria-label="Redo"><Redo2 size={14} /></button>
        <button onClick={() => save("Manual save")} className="px-2 py-1 rounded bg-gradient-primary text-primary-foreground font-semibold flex items-center gap-1">
          <Save size={12} /> {saving ? "Saving…" : dirty ? "Save" : "Saved"}
        </button>
        <button onClick={downloadPng} className="p-1.5 rounded hover:bg-muted" aria-label="Download"><Download size={14} /></button>
      </header>

      {/* Main area */}
      <div className="flex-1 min-h-0 flex">
        {/* Brush rail (left) */}
        <aside className="hidden sm:flex flex-col w-12 border-r border-border bg-card overflow-y-auto">
          {(Object.keys(DEFAULTS) as BrushId[]).map(id => (
            <button
              key={id}
              onClick={() => { setActiveBrushId(id); setBrushOverrides({}); }}
              className={`h-12 grid place-items-center text-[10px] ${activeBrushId === id ? "bg-primary/15 text-primary border-l-2 border-primary" : "hover:bg-muted"}`}
              title={BRUSH_LABELS[id]}
            >
              <BrushIcon size={16} />
            </button>
          ))}
        </aside>

        {/* Canvas */}
        <div ref={wrapRef} className="flex-1 min-w-0 relative bg-muted/30 overflow-auto grid place-items-center p-2">
          <canvas
            ref={composedRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="bg-white shadow-2xl rounded touch-none max-w-full max-h-full"
            style={{ width: "min(100%, 100vh)", aspectRatio: "1 / 1" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          />
          {/* Pressure HUD */}
          <div className="absolute top-3 left-3 bg-card/85 backdrop-blur rounded-full px-2.5 py-1 text-[10px] flex items-center gap-1.5 border border-border">
            <span className="text-muted-foreground">Pressure</span>
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-gradient-primary transition-[width]" style={{ width: `${Math.round(pressure * 100)}%` }} />
            </div>
          </div>
        </div>

        {/* Right panel: brush + layers */}
        <aside className="hidden lg:flex w-72 border-l border-border bg-card flex-col overflow-y-auto">
          <BrushPanel brush={brush} setOverrides={setBrushOverrides} color={color} setColor={setColor} smoothing={smoothing} setSmoothing={setSmoothing} />
          <LayersPanel state={state} setState={setState} setDirty={setDirty} updateLayer={updateLayer} addLayer={addLayer} deleteLayer={deleteLayer} moveLayer={moveLayer} />
        </aside>
      </div>

      {/* Mobile bottom bar */}
      <div className="lg:hidden shrink-0 border-t border-border bg-card">
        <div className="flex">
          <button onClick={() => { setShowBrushes(s => !s); setShowLayers(false); }} className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 ${showBrushes ? "text-primary" : ""}`}>
            <BrushIcon size={14} /> Brush
          </button>
          <button onClick={() => { setShowLayers(s => !s); setShowBrushes(false); }} className={`flex-1 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 ${showLayers ? "text-primary" : ""}`}>
            <LayersIcon size={14} /> Layers · {state.layers.length}
          </button>
        </div>
        {showBrushes && (
          <div className="border-t border-border max-h-[55vh] overflow-y-auto">
            <div className="grid grid-cols-3 gap-1 p-2">
              {(Object.keys(DEFAULTS) as BrushId[]).map(id => (
                <button key={id} onClick={() => { setActiveBrushId(id); setBrushOverrides({}); }} className={`py-2 rounded text-[11px] font-semibold ${activeBrushId === id ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {BRUSH_LABELS[id]}
                </button>
              ))}
            </div>
            <BrushPanel brush={brush} setOverrides={setBrushOverrides} color={color} setColor={setColor} smoothing={smoothing} setSmoothing={setSmoothing} />
          </div>
        )}
        {showLayers && (
          <div className="border-t border-border max-h-[55vh] overflow-y-auto">
            <LayersPanel state={state} setState={setState} setDirty={setDirty} updateLayer={updateLayer} addLayer={addLayer} deleteLayer={deleteLayer} moveLayer={moveLayer} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Subcomponents ---------- */

function BrushPanel(props: {
  brush: BrushSettings;
  setOverrides: React.Dispatch<React.SetStateAction<Partial<BrushSettings>>>;
  color: string;
  setColor: (c: string) => void;
  smoothing: number;
  setSmoothing: (n: number) => void;
}) {
  const { brush, setOverrides, color, setColor, smoothing, setSmoothing } = props;
  function set<K extends keyof BrushSettings>(k: K, v: BrushSettings[K]) {
    setOverrides(p => ({ ...p, [k]: v }));
  }
  return (
    <div className="p-3 border-b border-border space-y-2.5 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">{BRUSH_LABELS[brush.id]}</span>
        <input type="color" value={color} onChange={e => setColor(e.target.value)} className="h-7 w-9 rounded cursor-pointer bg-transparent border border-border" />
      </div>
      <Slider label="Size" value={brush.size} min={0.5} max={400} step={0.5} onChange={(v) => set("size", v)} />
      <Slider label="Opacity" value={brush.opacity * 100} min={1} max={100} step={1} onChange={(v) => set("opacity", v / 100)} suffix="%" />
      <Slider label="Flow" value={brush.flow * 100} min={1} max={100} step={1} onChange={(v) => set("flow", v / 100)} suffix="%" />
      <Slider label="Spacing" value={brush.spacing * 100} min={2} max={300} step={1} onChange={(v) => set("spacing", v / 100)} suffix="%" />
      <Slider label="Hardness" value={brush.hardness * 100} min={0} max={100} step={1} onChange={(v) => set("hardness", v / 100)} suffix="%" />
      <Slider label="Scatter" value={brush.scatter} min={0} max={40} step={0.5} onChange={(v) => set("scatter", v)} suffix="px" />
      <Slider label="Pressure → Size" value={brush.pressureSize * 100} min={0} max={100} step={1} onChange={(v) => set("pressureSize", v / 100)} suffix="%" />
      <Slider label="Pressure → Opacity" value={brush.pressureOpacity * 100} min={0} max={100} step={1} onChange={(v) => set("pressureOpacity", v / 100)} suffix="%" />
      <Slider label="Stabiliser" value={smoothing * 100} min={0} max={100} step={1} onChange={(v) => setSmoothing(v / 100)} suffix="%" />
    </div>
  );
}

function Slider(props: { label: string; value: number; min: number; max: number; step: number; suffix?: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{props.label}</span>
        <span>{Math.round(props.value)}{props.suffix ?? ""}</span>
      </div>
      <input type="range" min={props.min} max={props.max} step={props.step} value={props.value} onChange={(e) => props.onChange(parseFloat(e.target.value))} className="w-full accent-primary" />
    </label>
  );
}

function LayersPanel(props: {
  state: EditorState;
  setState: React.Dispatch<React.SetStateAction<EditorState | null>>;
  setDirty: (b: boolean) => void;
  updateLayer: (id: string, patch: Partial<LayerState>) => void;
  addLayer: () => void;
  deleteLayer: (id: string) => void;
  moveLayer: (id: string, dir: -1 | 1) => void;
}) {
  const { state, updateLayer, addLayer, deleteLayer, moveLayer } = props;
  function setActive(id: string) {
    props.setState({ ...state, activeLayerId: id });
  }
  return (
    <div className="flex-1 p-2 text-xs">
      <div className="flex items-center justify-between p-1">
        <span className="font-bold uppercase tracking-wider text-[10px] text-muted-foreground">Layers</span>
        <button onClick={addLayer} className="p-1 rounded hover:bg-muted" aria-label="Add layer"><Plus size={14} /></button>
      </div>
      <div className="space-y-1">
        {[...state.layers].reverse().map((layer) => {
          const active = layer.id === state.activeLayerId;
          return (
            <div key={layer.id} className={`rounded-lg border ${active ? "border-primary bg-primary/5" : "border-border"} p-2`}>
              <div className="flex items-center gap-1.5">
                <button onClick={() => updateLayer(layer.id, { visible: !layer.visible })} className="p-1" aria-label="Toggle visibility">
                  {layer.visible ? <Eye size={12} /> : <EyeOff size={12} className="text-muted-foreground" />}
                </button>
                <button onClick={() => setActive(layer.id)} className="flex-1 text-left truncate font-semibold">{layer.name}</button>
                <button onClick={() => moveLayer(layer.id, 1)} className="p-0.5 hover:bg-muted rounded" aria-label="Up"><ChevronUp size={11} /></button>
                <button onClick={() => moveLayer(layer.id, -1)} className="p-0.5 hover:bg-muted rounded" aria-label="Down"><ChevronDown size={11} /></button>
                <button onClick={() => updateLayer(layer.id, { locked: !layer.locked })} className="p-1" aria-label="Lock">
                  {layer.locked ? <Lock size={11} /> : <Unlock size={11} className="text-muted-foreground" />}
                </button>
                <button onClick={() => deleteLayer(layer.id)} className="p-1 text-destructive" aria-label="Delete"><Trash2 size={11} /></button>
              </div>
              {active && (
                <div className="mt-1.5 space-y-1.5">
                  <Slider label="Opacity" value={layer.opacity * 100} min={0} max={100} step={1} onChange={(v) => updateLayer(layer.id, { opacity: v / 100 })} suffix="%" />
                  <select
                    value={layer.blendMode}
                    onChange={(e) => updateLayer(layer.id, { blendMode: e.target.value as BlendMode })}
                    className="w-full bg-background border border-border rounded px-2 py-1 text-[11px] capitalize"
                  >
                    {BLEND_MODES.map(m => <option key={m} value={m}>{m.replace("-", " ")}</option>)}
                  </select>
                  <label className="flex items-center gap-1.5 text-[10px]">
                    <input type="checkbox" checked={layer.alphaLock} onChange={(e) => updateLayer(layer.id, { alphaLock: e.target.checked })} /> Alpha lock
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- helpers ---------- */

async function ensureEditorState(d: DocumentData): Promise<EditorState> {
  if (d.layeredEditorData) {
    try { return JSON.parse(d.layeredEditorData) as EditorState; } catch { /* fall through */ }
  }
  const w = CANVAS_W, h = CANVAS_H;
  const baseId = uuidv4();
  let baseDataUrl = "";
  if (d.originalAIImage) {
    baseDataUrl = await fitImageToDataUrl(d.originalAIImage, w, h);
  } else {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    baseDataUrl = c.toDataURL("image/png");
  }
  const inkId = uuidv4();
  return {
    width: w, height: h,
    activeLayerId: inkId,
    layers: [
      { id: baseId, name: "Base stencil", visible: true, locked: false, alphaLock: false, clipping: false, opacity: 1, blendMode: "normal", dataUrl: baseDataUrl },
      { id: inkId,  name: "Ink",          visible: true, locked: false, alphaLock: false, clipping: false, opacity: 1, blendMode: "normal", dataUrl: blankPng(w, h) },
    ],
  };
}

function blankPng(w: number, h: number): string {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  return c.toDataURL("image/png");
}

async function dataUrlToCanvas(url: string, w: number, h: number): Promise<HTMLCanvasElement> {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  if (!url) return c;
  await new Promise<void>((res) => {
    const img = new Image();
    img.onload = () => { c.getContext("2d")!.drawImage(img, 0, 0, w, h); res(); };
    img.onerror = () => res();
    img.src = url;
  });
  return c;
}

async function fitImageToDataUrl(url: string, w: number, h: number): Promise<string> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = w; c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
      const r = Math.min(w / img.width, h / img.height);
      const dw = img.width * r, dh = img.height * r;
      ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      res(c.toDataURL("image/png"));
    };
    img.onerror = () => res(blankPng(w, h));
    img.src = url;
  });
}