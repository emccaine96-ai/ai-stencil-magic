import { useState, useRef, useCallback, useEffect } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Wand2,
  Download,
  Layers,
  Ruler,
  RefreshCw,
  SplitSquareHorizontal,
  Eraser,
  Upload,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  processStencil,
  canvasToSVG,
  separateColorLayers,
  calculatePhysicalDimensions,
  STENCIL_PRESETS,
  type StencilOptions,
  type StencilPreset,
} from "@/lib/stencil-engine";
import { removeBackground } from "@/lib/background-removal";

interface StencilGeneratorPanelProps {
  sourceCanvas?: HTMLCanvasElement | null;
  onStencilReady?: (canvas: HTMLCanvasElement) => void;
}

const PRESETS: { value: StencilPreset; label: string; description: string; emoji: string }[] = [
  { value: "tattoo", label: "Tattoo", description: "Clean lines, high detail", emoji: "🖤" },
  { value: "streetart", label: "Street Art", description: "Bold, spray-paint ready", emoji: "🎨" },
  { value: "fineline", label: "Fine Line", description: "Ultra thin, detailed", emoji: "✏️" },
  { value: "craft", label: "Craft", description: "Cricut & Silhouette ready", emoji: "✂️" },
  { value: "bold", label: "Bold", description: "Thick lines, simple shapes", emoji: "💪" },
  { value: "procreate", label: "Procreate", description: "Digital art ready", emoji: "📱" },
  {
    value: "watercolor",
    label: "Watercolor",
    description: "Soft edges, painterly feel",
    emoji: "🎭",
  },
  { value: "sketch", label: "Sketch", description: "Pencil-thin Canny edges", emoji: "🖊️" },
];

const DPI_OPTIONS = [72, 150, 300, 600];

export function StencilGeneratorPanel({
  sourceCanvas,
  onStencilReady,
}: StencilGeneratorPanelProps) {
  const [options, setOptions] = useState<StencilOptions>({
    threshold: 128,
    edgeSensitivity: 50,
    lineThickness: 2,
    noiseReduction: 3,
    smoothing: 3,
    invertColors: false,
    preset: "tattoo",
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [isRemovingBg, setIsRemovingBg] = useState(false);
  const [resultCanvas, setResultCanvas] = useState<HTMLCanvasElement | null>(null);
  const [colorLayers, setColorLayers] = useState<ImageData[]>([]);
  const [selectedDPI, setSelectedDPI] = useState(300);
  const [activeTab, setActiveTab] = useState("generate");

  const previewRef = useRef<HTMLCanvasElement>(null);
  const originalPreviewRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [localCanvas, setLocalCanvas] = useState<HTMLCanvasElement | null>(null);

  const [compareSplit, setCompareSplit] = useState(50); // 0-100, % of "Original" visible from the left
  const compareWrapRef = useRef<HTMLDivElement>(null);
  const compareDragging = useRef(false);

  const updateCompareFromClientX = useCallback((clientX: number) => {
    const el = compareWrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setCompareSplit(Math.max(0, Math.min(100, pct)));
  }, []);
  const handleCompareDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      compareDragging.current = true;
      (e.target as Element).setPointerCapture?.(e.pointerId);
      updateCompareFromClientX(e.clientX);
    },
    [updateCompareFromClientX],
  );
  const handleCompareMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!compareDragging.current) return;
      updateCompareFromClientX(e.clientX);
    },
    [updateCompareFromClientX],
  );
  const handleCompareUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    compareDragging.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  }, []);

  const workingCanvas = sourceCanvas || localCanvas;

  useEffect(() => {
    if (workingCanvas && originalPreviewRef.current) {
      const ctx = originalPreviewRef.current.getContext("2d")!;
      originalPreviewRef.current.width = workingCanvas.width;
      originalPreviewRef.current.height = workingCanvas.height;
      ctx.drawImage(workingCanvas, 0, 0);
    }
  }, [workingCanvas]);

  const applyPreset = useCallback((preset: StencilPreset) => {
    const presetValues = STENCIL_PRESETS[preset];
    setOptions((prev) => ({ ...prev, ...presetValues, preset }));
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!workingCanvas) {
      toast.error("Please upload an image first");
      return;
    }
    setIsProcessing(true);
    try {
      const result = await processStencil(workingCanvas, options);
      setResultCanvas(result);
      if (previewRef.current) {
        previewRef.current.width = result.width;
        previewRef.current.height = result.height;
        previewRef.current.getContext("2d")!.drawImage(result, 0, 0);
      }
      onStencilReady?.(result);
      toast.success("Stencil generated!");
    } catch {
      toast.error("Generation failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }, [workingCanvas, options, onStencilReady]);

  const handleRemoveBackground = useCallback(async () => {
    if (!workingCanvas) {
      toast.error("Upload an image first");
      return;
    }
    setIsRemovingBg(true);
    try {
      const result = await removeBackground(workingCanvas);
      setLocalCanvas(result);
      toast.success("Background removed!");
    } catch {
      toast.error("Background removal failed");
    } finally {
      setIsRemovingBg(false);
    }
  }, [workingCanvas]);

  const handleSeparateLayers = useCallback(() => {
    if (!workingCanvas) return;
    const ctx = workingCanvas.getContext("2d")!;
    const imageData = ctx.getImageData(0, 0, workingCanvas.width, workingCanvas.height);
    const layers = separateColorLayers(imageData, 5);
    setColorLayers(layers);
    toast.success(`${layers.length} color layers detected`);
  }, [workingCanvas]);

  const handleExportSVG = useCallback(() => {
    if (!resultCanvas) {
      toast.error("Generate a stencil first");
      return;
    }
    const svg = canvasToSVG(resultCanvas);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stencil.svg";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("SVG exported!");
  }, [resultCanvas]);

  const handleExportPNG = useCallback(() => {
    if (!resultCanvas) {
      toast.error("Generate a stencil first");
      return;
    }
    const a = document.createElement("a");
    a.href = resultCanvas.toDataURL("image/png");
    a.download = "stencil.png";
    a.click();
    toast.success("PNG exported!");
  }, [resultCanvas]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      setLocalCanvas(canvas);
    };
    img.src = URL.createObjectURL(file);
  }, []);

  const physicalDims = workingCanvas
    ? calculatePhysicalDimensions(workingCanvas.width, workingCanvas.height, selectedDPI)
    : null;

  return (
    <div className="flex flex-col gap-4 p-4 bg-background rounded-xl border border-border w-full max-w-2xl">
      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold">Stencil Generator</h2>
        <Badge variant="secondary" className="ml-auto">
          100% Local · No AI
        </Badge>
      </div>

      {!workingCanvas && (
        <div
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary transition-colors"
        >
          <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Click to upload image</p>
          <p className="text-xs text-muted-foreground mt-1">PNG, JPG, WEBP supported</p>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*"
            onChange={handleFileUpload}
          />
        </div>
      )}

      {workingCanvas && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs text-muted-foreground">
              {resultCanvas ? "Drag to compare" : "Original"}
            </span>
            {resultCanvas && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {Math.round(compareSplit)}%
              </span>
            )}
          </div>
          <div
            ref={compareWrapRef}
            className="relative w-full h-56 rounded border border-border overflow-hidden bg-white select-none"
            style={{ touchAction: "none" }}
            onPointerDown={resultCanvas ? handleCompareDown : undefined}
            onPointerMove={resultCanvas ? handleCompareMove : undefined}
            onPointerUp={resultCanvas ? handleCompareUp : undefined}
            onPointerCancel={resultCanvas ? handleCompareUp : undefined}
          >
            <canvas ref={previewRef} className="absolute inset-0 w-full h-full object-contain" />
            <canvas
              ref={originalPreviewRef}
              className="absolute inset-0 w-full h-full object-contain"
              style={resultCanvas ? { clipPath: `inset(0 ${100 - compareSplit}% 0 0)` } : undefined}
            />
            {resultCanvas && (
              <div
                className="absolute inset-y-0 flex items-center justify-center"
                style={{ left: `${compareSplit}%`, transform: "translateX(-50%)", pointerEvents: "none" }}
              >
                <div className="absolute inset-y-0 w-0.5 bg-primary" />
                <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg">
                  <SplitSquareHorizontal className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
              </div>
            )}
          </div>
          {resultCanvas && (
            <div className="flex justify-between text-[10px] text-muted-foreground px-0.5">
              <span>Original</span>
              <span>Stencil</span>
            </div>
          )}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full">
          <TabsTrigger value="generate" className="flex-1">
            Generate
          </TabsTrigger>
          <TabsTrigger value="advanced" className="flex-1">
            Advanced
          </TabsTrigger>
          <TabsTrigger value="export" className="flex-1">
            Export
          </TabsTrigger>
          <TabsTrigger value="layers" className="flex-1">
            Layers
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="flex flex-col gap-4 mt-4">
          <div>
            <Label className="text-sm font-medium mb-2 block">Style Preset</Label>
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => applyPreset(p.value)}
                  className={`p-2 rounded-lg border text-left transition-all hover:border-primary ${
                    options.preset === p.value ? "border-primary bg-primary/10" : "border-border"
                  }`}
                >
                  <div className="text-lg">{p.emoji}</div>
                  <div className="text-xs font-medium">{p.label}</div>
                  <div className="text-xs text-muted-foreground">{p.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <Label className="text-sm">Threshold</Label>
              <span className="text-xs text-muted-foreground">{options.threshold}</span>
            </div>
            <Slider
              min={0}
              max={255}
              step={1}
              value={[options.threshold]}
              onValueChange={([v]) =>
                setOptions((prev) => ({ ...prev, threshold: v, preset: "custom" }))
              }
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRemoveBackground}
              disabled={isRemovingBg || !workingCanvas}
              className="flex-1"
            >
              {isRemovingBg ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Eraser className="w-4 h-4 mr-2" />
              )}
              Remove BG
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSeparateLayers}
              disabled={!workingCanvas}
              className="flex-1"
            >
              <Layers className="w-4 h-4 mr-2" />
              Split Colors
            </Button>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isProcessing || !workingCanvas}
            className="w-full"
            size="lg"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4 mr-2" />
                Generate Stencil
              </>
            )}
          </Button>
        </TabsContent>

        <TabsContent value="advanced" className="flex flex-col gap-4 mt-4">
          {(
            [
              { key: "edgeSensitivity", label: "Edge Sensitivity", min: 0, max: 100 },
              { key: "lineThickness", label: "Line Thickness", min: 1, max: 10 },
              { key: "noiseReduction", label: "Noise Reduction", min: 0, max: 10 },
              { key: "smoothing", label: "Smoothing", min: 0, max: 10 },
            ] as const
          ).map(({ key, label, min, max }) => (
            <div key={key} className="flex flex-col gap-2">
              <div className="flex justify-between">
                <Label className="text-sm">{label}</Label>
                <span className="text-xs text-muted-foreground">{options[key] as number}</span>
              </div>
              <Slider
                min={min}
                max={max}
                step={1}
                value={[options[key] as number]}
                onValueChange={([v]) =>
                  setOptions((prev) => ({ ...prev, [key]: v, preset: "custom" }))
                }
              />
            </div>
          ))}

          <div className="flex items-center justify-between">
            <Label className="text-sm">Invert Colors</Label>
            <Switch
              checked={options.invertColors}
              onCheckedChange={(v) => setOptions((prev) => ({ ...prev, invertColors: v }))}
            />
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isProcessing || !workingCanvas}
            className="w-full"
          >
            {isProcessing ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4 mr-2" />
            )}
            Apply & Regenerate
          </Button>
        </TabsContent>

        <TabsContent value="export" className="flex flex-col gap-4 mt-4">
          <div className="flex flex-col gap-2">
            <Label className="text-sm font-medium">Output DPI</Label>
            <div className="flex gap-2">
              {DPI_OPTIONS.map((dpi) => (
                <button
                  key={dpi}
                  onClick={() => setSelectedDPI(dpi)}
                  className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-all ${
                    selectedDPI === dpi
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border"
                  }`}
                >
                  {dpi}
                </button>
              ))}
            </div>
          </div>

          {physicalDims && (
            <div className="bg-muted rounded-lg p-3 flex flex-col gap-1">
              <div className="flex items-center gap-2 mb-1">
                <Ruler className="w-4 h-4" />
                <span className="text-sm font-medium">
                  Physical Dimensions at {selectedDPI} DPI
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <span className="text-muted-foreground">Width:</span>
                <span>
                  {physicalDims.widthInches}" / {physicalDims.widthCm}cm
                </span>
                <span className="text-muted-foreground">Height:</span>
                <span>
                  {physicalDims.heightInches}" / {physicalDims.heightCm}cm
                </span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={handleExportPNG}
              disabled={!resultCanvas}
              className="w-full"
            >
              <Download className="w-4 h-4 mr-2" />
              PNG (Transparent)
            </Button>
            <Button
              variant="outline"
              onClick={handleExportSVG}
              disabled={!resultCanvas}
              className="w-full"
            >
              <Download className="w-4 h-4 mr-2" />
              SVG (Vector)
            </Button>
          </div>

          <Button
            variant="outline"
            disabled={!resultCanvas}
            className="w-full"
            onClick={() => {
              if (!resultCanvas) return;
              const a = document.createElement("a");
              a.href = resultCanvas.toDataURL("image/png");
              a.download = "stencil-cricut.png";
              a.click();
              toast.success("Cricut-ready file exported!");
            }}
          >
            <Download className="w-4 h-4 mr-2" />
            Cricut / Silhouette Ready
          </Button>
        </TabsContent>

        <TabsContent value="layers" className="flex flex-col gap-4 mt-4">
          {colorLayers.length === 0 ? (
            <div className="text-center py-8">
              <SplitSquareHorizontal className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Click Split Colors to separate your image into individual stencil layers
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={handleSeparateLayers}
                disabled={!workingCanvas}
              >
                <Layers className="w-4 h-4 mr-2" />
                Split Into Layers
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                {colorLayers.length} color layers detected
              </p>
              {colorLayers.map((layerData, i) => {
                const layerCanvas = document.createElement("canvas");
                layerCanvas.width = workingCanvas!.width;
                layerCanvas.height = workingCanvas!.height;
                layerCanvas.getContext("2d")!.putImageData(layerData, 0, 0);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 p-2 rounded-lg border border-border"
                  >
                    <span className="text-sm font-medium w-16">Layer {i + 1}</span>
                    <div className="flex-1 h-12 bg-white rounded border overflow-hidden">
                      <img
                        src={layerCanvas.toDataURL()}
                        className="w-full h-full object-contain"
                        alt={`Layer ${i + 1}`}
                      />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = layerCanvas.toDataURL("image/png");
                        a.download = `stencil-layer-${i + 1}.png`;
                        a.click();
                      }}
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
