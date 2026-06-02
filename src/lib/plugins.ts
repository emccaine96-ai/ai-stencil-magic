/**
 * Plugin SDK — user-scriptable filters/generators that run inside a sandboxed
 * iframe so untrusted code never touches the host page.
 *
 * Filter signature:    (ctx) => void   ctx = { width, height, data: Uint8ClampedArray, params }
 * Generator signature: (ctx) => void   same shape; data starts blank.
 */

export type PluginKind = "filter" | "generator";

export type Plugin = {
  id: string;
  name: string;
  version: string;
  author?: string;
  kind: PluginKind;
  description?: string;
  code: string;
  params?: Array<{ key: string; label: string; type: "number" | "string" | "boolean"; default: any; min?: number; max?: number; step?: number }>;
};

const STORE_KEY = "primalcanvas:plugins:v1";

export function loadPlugins(): Plugin[] {
  if (typeof localStorage === "undefined") return BUILTIN_PLUGINS;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const user = raw ? (JSON.parse(raw) as Plugin[]) : [];
    return [...BUILTIN_PLUGINS, ...user];
  } catch { return BUILTIN_PLUGINS; }
}

export function saveUserPlugins(plugins: Plugin[]) {
  const user = plugins.filter(p => !BUILTIN_PLUGINS.some(b => b.id === p.id));
  localStorage.setItem(STORE_KEY, JSON.stringify(user));
}

export function runPlugin(plugin: Plugin, image: ImageData, params: Record<string, any>, timeoutMs = 5000): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.sandbox.add("allow-scripts");
    iframe.style.display = "none";
    const html = "<!doctype html><html><body><script>" +
      "window.addEventListener('message', function(e){" +
      "  var d = e.data || {};" +
      "  try {" +
      "    var data = new Uint8ClampedArray(d.buffer);" +
      "    var ctx = { width: d.width, height: d.height, data: data, params: d.params };" +
      "    var fn = new Function('ctx', d.code);" +
      "    var start = Date.now();" +
      "    fn(ctx);" +
      "    parent.postMessage({ id: d.id, ok: true, buffer: data.buffer, ms: Date.now()-start }, '*', [data.buffer]);" +
      "  } catch (err) {" +
      "    parent.postMessage({ id: d.id, ok: false, error: String(err && err.message || err) }, '*');" +
      "  }" +
      "});" +
      "parent.postMessage({ ready: true }, '*');" +
      "</script></body></html>";
    iframe.srcdoc = html;
    const id = Math.random().toString(36).slice(2);
    let done = false;
    const cleanup = () => { window.removeEventListener("message", onMsg); iframe.remove(); };
    const timer = setTimeout(() => {
      if (!done) { done = true; cleanup(); reject(new Error("plugin timeout")); }
    }, timeoutMs + 500);
    function onMsg(ev: MessageEvent) {
      if (ev.source !== iframe.contentWindow) return;
      const msg: any = ev.data;
      if (msg?.ready) {
        const copy = new Uint8ClampedArray(image.data);
        iframe.contentWindow!.postMessage({
          id, width: image.width, height: image.height,
          buffer: copy.buffer, code: plugin.code, params,
        }, "*", [copy.buffer]);
        return;
      }
      if (msg?.id !== id) return;
      done = true; clearTimeout(timer); cleanup();
      if (!msg.ok) return reject(new Error(msg.error || "plugin error"));
      const arr = new Uint8ClampedArray(msg.buffer);
      resolve(new ImageData(arr, image.width, image.height));
    }
    window.addEventListener("message", onMsg);
    document.body.appendChild(iframe);
  });
}

export const BUILTIN_PLUGINS: Plugin[] = [
  {
    id: "builtin.posterize",
    name: "Posterize",
    version: "1.0",
    author: "PrimalCanvas",
    kind: "filter",
    description: "Reduces colors to N levels per channel — great for stencil simplification.",
    params: [{ key: "levels", label: "Levels", type: "number", default: 4, min: 2, max: 16, step: 1 }],
    code: [
      "var n = Math.max(2, Math.min(16, ctx.params.levels|0));",
      "var step = 255 / (n - 1);",
      "for (var i = 0; i < ctx.data.length; i += 4) {",
      "  ctx.data[i]   = Math.round(ctx.data[i]   / step) * step;",
      "  ctx.data[i+1] = Math.round(ctx.data[i+1] / step) * step;",
      "  ctx.data[i+2] = Math.round(ctx.data[i+2] / step) * step;",
      "}",
    ].join("\n"),
  },
  {
    id: "builtin.dotgrid",
    name: "Dot Grid",
    version: "1.0",
    author: "PrimalCanvas",
    kind: "generator",
    description: "Generates a black dot grid — useful as a stencil reference layer.",
    params: [
      { key: "spacing", label: "Spacing", type: "number", default: 24, min: 4, max: 200, step: 1 },
      { key: "radius", label: "Radius", type: "number", default: 2, min: 1, max: 40, step: 1 },
    ],
    code: [
      "var sp = ctx.params.spacing|0, r = ctx.params.radius|0;",
      "for (var y = 0; y < ctx.height; y++) {",
      "  for (var x = 0; x < ctx.width; x++) {",
      "    var dx = x % sp - sp/2, dy = y % sp - sp/2;",
      "    var inside = dx*dx + dy*dy <= r*r;",
      "    var i = (y * ctx.width + x) * 4;",
      "    ctx.data[i] = ctx.data[i+1] = ctx.data[i+2] = 0;",
      "    ctx.data[i+3] = inside ? 255 : 0;",
      "  }",
      "}",
    ].join("\n"),
  },
  {
    id: "builtin.edge-glow",
    name: "Edge Glow",
    version: "1.0",
    author: "PrimalCanvas",
    kind: "filter",
    description: "Sobel edge detection with a warm colored glow.",
    params: [{ key: "intensity", label: "Intensity", type: "number", default: 1.5, min: 0.1, max: 5, step: 0.1 }],
    code: [
      "var w = ctx.width, h = ctx.height, d = ctx.data, k = +ctx.params.intensity;",
      "var out = new Uint8ClampedArray(d.length);",
      "function g(x,y){ var i=(y*w+x)*4; return 0.3*d[i]+0.59*d[i+1]+0.11*d[i+2]; }",
      "for (var y=1;y<h-1;y++) for (var x=1;x<w-1;x++) {",
      "  var gx = -g(x-1,y-1)-2*g(x-1,y)-g(x-1,y+1)+g(x+1,y-1)+2*g(x+1,y)+g(x+1,y+1);",
      "  var gy = -g(x-1,y-1)-2*g(x,y-1)-g(x+1,y-1)+g(x-1,y+1)+2*g(x,y+1)+g(x+1,y+1);",
      "  var m = Math.min(255, Math.hypot(gx,gy) * k);",
      "  var i = (y*w+x)*4;",
      "  out[i]=m; out[i+1]=m*0.7; out[i+2]=m*0.4; out[i+3]=255;",
      "}",
      "for (var j=0;j<d.length;j++) d[j]=out[j];",
    ].join("\n"),
  },
];