/**
 * Plugin SDK — user-scriptable filters/generators that run inside a sandboxed
 * Web Worker created from a Blob URL. Worker environment has no DOM or
 * localStorage access, ensuring untrusted third-party code is fully isolated.
 *
 * Signature verification prevents unauthorized execution: third-party code
 * runs ONLY if verified against a trusted publisher key.
 *
 * Filter signature:    (ctx) => void   ctx = { width, height, data: Uint8ClampedArray, params }
 * Generator signature: (ctx) => void   same shape; data starts blank.
 */

import {
  verifyPlugin,
  loadTrustedKeysFromStorage,
  type PluginManifest,
  type VerificationStatus,
  type PluginVerificationResult,
} from "./plugin-signing";

export type PluginKind = "filter" | "generator";

export type Plugin = {
  id: string;
  name: string;
  version: string;
  author?: string;
  kind: PluginKind;
  description?: string;
  code: string;
  signature?: string;
  publisherKeyId?: string;
  expiresAt?: number;
  revoked?: boolean;
  verificationStatus?: VerificationStatus;
  verificationReason?: string;
  params?: Array<{
    key: string;
    label: string;
    type: "number" | "string" | "boolean";
    default: any;
    min?: number;
    max?: number;
    step?: number;
  }>;
};

const STORE_KEY = "stencilmagic:plugins:v1";

/**
 * A plugin is built-in only if BOTH its id and its code match the bundled original.
 * Matching on id alone would let an installed plugin claim "builtin.*" and skip verification.
 */
export function isBuiltinPlugin(plugin: Plugin): boolean {
  return BUILTIN_PLUGINS.some((b) => b.id === plugin.id && b.code === plugin.code);
}

/** True if the id is reserved for built-ins (installed plugins may not use it). */
export function isReservedPluginId(id: string): boolean {
  return id.startsWith("builtin.") || BUILTIN_PLUGINS.some((b) => b.id === id);
}

export function loadPlugins(): Plugin[] {
  loadTrustedKeysFromStorage();
  if (typeof localStorage === "undefined") return BUILTIN_PLUGINS;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const user = (raw ? (JSON.parse(raw) as Plugin[]) : []).filter((p) => !isReservedPluginId(p.id));
    return [...BUILTIN_PLUGINS, ...user];
  } catch {
    return BUILTIN_PLUGINS;
  }
}

export function saveUserPlugins(plugins: Plugin[]) {
  const user = plugins.filter((p) => !isReservedPluginId(p.id));
  localStorage.setItem(STORE_KEY, JSON.stringify(user));
}

/** Check verification status of a plugin */
export async function checkPluginStatus(plugin: Plugin): Promise<PluginVerificationResult> {
  if (isBuiltinPlugin(plugin)) {
    return { valid: true, status: "verified" };
  }
  return await verifyPlugin(plugin);
}

/** Maximum image payload size: 50 MB */
const MAX_IMAGE_BUFFER_BYTES = 50 * 1024 * 1024;

export async function runPlugin(
  plugin: Plugin,
  image: ImageData,
  params: Record<string, any>,
  timeoutMs = 10000,
): Promise<ImageData> {
  // Security Check: Built-in plugins are exempt; third-party/user plugins MUST be verified.
  if (!isBuiltinPlugin(plugin)) {
    const verification = await verifyPlugin(plugin);
    if (!verification.valid) {
      const msg = verification.reason || `Plugin verification failed (${verification.status})`;
      throw new Error(`Cannot execute plugin '${plugin.name}': ${msg}`);
    }
  }

  if (image.data.byteLength > MAX_IMAGE_BUFFER_BYTES) {
    throw new Error(
      `Image size (${(image.data.byteLength / 1024 / 1024).toFixed(1)}MB) exceeds safety limit (50MB)`,
    );
  }

  return new Promise((resolve, reject) => {
    // Web Worker script running in isolated global scope (no DOM, no window, no localStorage)

    let worker: Worker | null = null;
    let done = false;

    const cleanup = () => {
      if (worker) {
        worker.terminate();
        worker = null;
      }
    };

    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        cleanup();
        reject(new Error(`Plugin execution timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);

    try {
      // Loaded from a real URL (not a Blob) so the response's own CSP header applies to the worker.
      worker = new Worker("/plugin-worker.js");

      const id = Math.random().toString(36).slice(2);
      const copy = new Uint8ClampedArray(image.data);

      worker.onmessage = (ev: MessageEvent) => {
        const msg = ev.data;
        if (!msg || msg.id !== id) return;
        done = true;
        clearTimeout(timer);
        cleanup();

        if (!msg.ok) {
          reject(new Error(msg.error || "Plugin execution failed"));
          return;
        }

        const arr = new Uint8ClampedArray(msg.buffer);
        resolve(new ImageData(arr, image.width, image.height));
      };

      worker.onerror = (ev: ErrorEvent) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          cleanup();
          reject(new Error(ev.message || "Plugin worker error"));
        }
      };

      worker.postMessage(
        {
          type: "run",
          id,
          width: image.width,
          height: image.height,
          buffer: copy.buffer,
          code: plugin.code,
          params,
        },
        [copy.buffer],
      );
    } catch (e: any) {
      done = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error(e.message || String(e)));
    }
  });
}

export const BUILTIN_PLUGINS: Plugin[] = [
  {
    id: "builtin.posterize",
    name: "Posterize",
    version: "1.0",
    author: "AI Stencil Magic",
    kind: "filter",
    description: "Reduces colors to N levels per channel — great for stencil simplification.",
    params: [
      { key: "levels", label: "Levels", type: "number", default: 4, min: 2, max: 16, step: 1 },
    ],
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
    author: "AI Stencil Magic",
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
    author: "AI Stencil Magic",
    kind: "filter",
    description: "Sobel edge detection with a warm colored glow.",
    params: [
      {
        key: "intensity",
        label: "Intensity",
        type: "number",
        default: 1.5,
        min: 0.1,
        max: 5,
        step: 0.1,
      },
    ],
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
  {
    id: "builtin.stencil-sharpen",
    name: "Stencil Sharpen",
    version: "1.0",
    author: "AI Stencil Magic",
    kind: "filter",
    description: "Unsharp mask tuned for stencil edges — enhances line clarity without adding noise.",
    params: [
      { key: "amount", label: "Amount", type: "number", default: 1.2, min: 0.1, max: 5, step: 0.1 },
      { key: "radius", label: "Radius", type: "number", default: 2, min: 1, max: 10, step: 1 },
    ],
    code: [
      "var w=ctx.width,h=ctx.height,d=ctx.data,amt=+ctx.params.amount,r=ctx.params.radius|0;",
      "var blurR=new Float32Array(w*h),blurG=new Float32Array(w*h),blurB=new Float32Array(w*h);",
      "for(var y=0;y<h;y++)for(var x=0;x<w;x++){",
      "  var sr=0,sg=0,sb=0,c=0;",
      "  for(var dy=-r;dy<=r;dy++)for(var dx=-r;dx<=r;dx++){",
      "    var nx=x+dx,ny=y+dy;",
      "    if(nx<0||nx>=w||ny<0||ny>=h)continue;",
      "    var i=(ny*w+nx)*4;",
      "    if(d[i+3]<=10)continue;",
      "    sr+=d[i];sg+=d[i+1];sb+=d[i+2];c++;",
      "  }",
      "  var p=y*w+x;",
      "  if(c>0){blurR[p]=sr/c;blurG[p]=sg/c;blurB[p]=sb/c;}",
      "}",
      "for(var y2=0;y2<h;y2++)for(var x2=0;x2<w;x2++){",
      "  var j=(y2*w+x2)*4;",
      "  if(d[j+3]<=10)continue;",
      "  var p2=y2*w+x2;",
      "  d[j]=Math.max(0,Math.min(255,d[j]+amt*(d[j]-blurR[p2])));",
      "  d[j+1]=Math.max(0,Math.min(255,d[j+1]+amt*(d[j+1]-blurG[p2])));",
      "  d[j+2]=Math.max(0,Math.min(255,d[j+2]+amt*(d[j+2]-blurB[p2])));",
      "}",
    ].join("\n"),
  },
  {
    id: "builtin.smart-contrast",
    name: "Smart Contrast",
    version: "1.0",
    author: "AI Stencil Magic",
    kind: "filter",
    description: "Adaptive histogram stretch — pulls detail out of dark shadows and blown highlights automatically.",
    params: [
      { key: "strength", label: "Strength", type: "number", default: 0.85, min: 0.1, max: 1.5, step: 0.05 },
    ],
    code: [
      "var d=ctx.data,s=+ctx.params.strength;",
      "var min=255,max=0;",
      "for(var i=0;i<d.length;i+=4){",
      "  if(d[i+3]<=10)continue;",
      "  var lum=0.3*d[i]+0.59*d[i+1]+0.11*d[i+2];",
      "  if(lum<min)min=lum;if(lum>max)max=lum;",
      "}",
      "var range=max-min;",
      "if(range>=20){",
      "  var scale=255*s/range;",
      "  for(var j=0;j<d.length;j+=4){",
      "    if(d[j+3]<=10)continue;",
      "    d[j]=Math.max(0,Math.min(255,(d[j]-min)*scale));",
      "    d[j+1]=Math.max(0,Math.min(255,(d[j+1]-min)*scale));",
      "    d[j+2]=Math.max(0,Math.min(255,(d[j+2]-min)*scale));",
      "  }",
      "}",
    ].join("\n"),
  },
  {
    id: "builtin.hectograph-purple",
    name: "Hectograph Purple",
    version: "1.0",
    author: "AI Stencil Magic",
    kind: "filter",
    description: "Applies the classic purple transfer-paper tint to any stencil. Toggleable intensity.",
    params: [
      { key: "intensity", label: "Intensity", type: "number", default: 0.8, min: 0, max: 1, step: 0.05 },
    ],
    code: [
      "var d=ctx.data,a=+ctx.params.intensity;",
      "for(var i=0;i<d.length;i+=4){",
      "  var lum=0.3*d[i]+0.59*d[i+1]+0.11*d[i+2];",
      "  var isLine=lum<128;",
      "  if(isLine){",
      "    d[i]=Math.round(d[i]*(1-a)+80*a);",
      "    d[i+1]=Math.round(d[i+1]*(1-a)+30*a);",
      "    d[i+2]=Math.round(d[i+2]*(1-a)+120*a);",
      "  } else {",
      "    d[i]=255;d[i+1]=255;d[i+2]=255;",
      "  }",
      "}",
    ].join("\n"),
  },
];
