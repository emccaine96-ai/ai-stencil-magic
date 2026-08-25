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

export function loadPlugins(): Plugin[] {
  if (typeof localStorage === "undefined") return BUILTIN_PLUGINS;
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const user = raw ? (JSON.parse(raw) as Plugin[]) : [];
    return [...BUILTIN_PLUGINS, ...user];
  } catch {
    return BUILTIN_PLUGINS;
  }
}

export function saveUserPlugins(plugins: Plugin[]) {
  const user = plugins.filter((p) => !BUILTIN_PLUGINS.some((b) => b.id === p.id));
  localStorage.setItem(STORE_KEY, JSON.stringify(user));
}

export function runPlugin(
  plugin: Plugin,
  image: ImageData,
  params: Record<string, any>,
  timeoutMs = 5000,
): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.sandbox.add("allow-scripts");
    iframe.style.display = "none";
    const html =
      "<!doctype html><html><body><script>" +
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
    const cleanup = () => {
      window.removeEventListener("message", onMsg);
      iframe.remove();
    };
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        cleanup();
        reject(new Error("plugin timeout"));
      }
    }, timeoutMs + 500);
    function onMsg(ev: MessageEvent) {
      if (ev.source !== iframe.contentWindow) return;
      const msg: any = ev.data;
      if (msg?.ready) {
        const copy = new Uint8ClampedArray(image.data);
        iframe.contentWindow!.postMessage(
          {
            id,
            width: image.width,
            height: image.height,
            buffer: copy.buffer,
            code: plugin.code,
            params,
          },
          "*",
          [copy.buffer],
        );
        return;
      }
      if (msg?.id !== id) return;
      done = true;
      clearTimeout(timer);
      cleanup();
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
      "var blur=new Uint8ClampedArray(d.length);",
      "for(var y=0;y<h;y++)for(var x=0;x<w;x++){",
      "  var sr=0,sg=0,sb=0,c=0;",
      "  for(var dy=-r;dy<=r;dy++)for(var dx=-r;dx<=r;dx++){",
      "    var nx=x+dx,ny=y+dy;",
      "    if(nx<0||nx>=w||ny<0||ny>=h)continue;",
      "    var i=(ny*w+nx)*4;",
      "    sr+=d[i];sg+=d[i+1];sb+=d[i+2];c++;",
      "  }",
      "  var i=(y*w+x)*4;",
      "  blur[i]=sr/c;blur[i+1]=sg/c;blur[i+2]=sb/c;",
      "}",
      "for(var j=0;j<d.length;j+=4){",
      "  d[j]=Math.max(0,Math.min(255,d[j]+amt*(d[j]-blur[j])));",
      "  d[j+1]=Math.max(0,Math.min(255,d[j+1]+amt*(d[j+1]-blur[j+1])));",
      "  d[j+2]=Math.max(0,Math.min(255,d[j+2]+amt*(d[j+2]-blur[j+2])));",
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
      "  var lum=0.3*d[i]+0.59*d[i+1]+0.11*d[i+2];",
      "  if(lum<min)min=lum;if(lum>max)max=lum;",
      "}",
      "var range=Math.max(1,max-min);",
      "var scale=255*s/range;",
      "for(var j=0;j<d.length;j+=4){",
      "  d[j]=Math.max(0,Math.min(255,(d[j]-min)*scale));",
      "  d[j+1]=Math.max(0,Math.min(255,(d[j+1]-min)*scale));",
      "  d[j+2]=Math.max(0,Math.min(255,(d[j+2]-min)*scale));",
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
  {
    id: "builtin.edge-connector",
    name: "Edge Connector",
    version: "1.1",
    author: "AI Stencil Magic",
    kind: "filter",
    description: "Bridges small gaps in broken lines via a true morphological close (dilate then erode) — fills small gaps without thickening the rest of the artwork.",
    params: [
      { key: "radius", label: "Bridge Radius", type: "number", default: 2, min: 1, max: 8, step: 1 },
    ],
    code: [
      "var w=ctx.width,h=ctx.height,d=ctx.data,r=ctx.params.radius|0;",
      "function isDark(arr,x,y){if(x<0||x>=w||y<0||y>=h)return false;return arr[(y*w+x)*4]<128;}",
      "function pass(src,grow){",
      "  var out=new Uint8ClampedArray(src.length);",
      "  for(var y=0;y<h;y++)for(var x=0;x<w;x++){",
      "    var hit=false;",
      "    for(var dy=-r;dy<=r&&!hit;dy++)for(var dx=-r;dx<=r;dx++){",
      "      if(isDark(src,x+dx,y+dy)===grow){hit=true;break;}",
      "    }",
      "    var dark = grow ? hit : !hit;",
      "    var i=(y*w+x)*4;",
      "    out[i]=dark?0:255;out[i+1]=dark?0:255;out[i+2]=dark?0:255;out[i+3]=255;",
      "  }",
      "  return out;",
      "}",
      "var dilated=pass(d,true);",
      "var closed=pass(dilated,false);",
      "for(var j=0;j<d.length;j++)d[j]=closed[j];",
    ].join("\n"),
  },
  {
    id: "builtin.line-thinning",
    name: "Line Thinning",
    version: "1.0",
    author: "AI Stencil Magic",
    kind: "filter",
    description: "Morphological erosion — thins stencil lines for fine-line and single-needle work.",
    params: [
      { key: "iterations", label: "Iterations", type: "number", default: 1, min: 1, max: 5, step: 1 },
    ],
    code: [
      "var w=ctx.width,h=ctx.height,d=ctx.data,iters=ctx.params.iterations|0;",
      "for(var it=0;it<iters;it++){",
      "  var out=new Uint8ClampedArray(d.length);",
      "  for(var y=0;y<h;y++)for(var x=0;x<w;x++){",
      "    var allDark=true;",
      "    for(var dy=-1;dy<=1&&allDark;dy++)for(var dx=-1;dx<=1;dx++){",
      "      var nx=x+dx,ny=y+dy;",
      "      if(nx<0||nx>=w||ny<0||ny>=h)continue;",
      "      if(d[(ny*w+nx)*4]>128){allDark=false;break;}",
      "    }",
      "    var i=(y*w+x)*4;",
      "    out[i]=allDark?0:255;out[i+1]=allDark?0:255;out[i+2]=allDark?0:255;out[i+3]=255;",
      "  }",
      "  for(var j=0;j<d.length;j++)d[j]=out[j];",
      "}",
    ].join("\n"),
  },
  {
    id: "builtin.halftone-stipple",
    name: "Halftone Stipple",
    version: "1.0",
    author: "AI Stencil Magic",
    kind: "generator",
    description: "Generates a stippling dot pattern from image luminance — dot size based on darkness, like whip shading.",
    params: [
      { key: "spacing", label: "Dot Spacing", type: "number", default: 8, min: 4, max: 30, step: 1 },
      { key: "maxRadius", label: "Max Dot Size", type: "number", default: 4, min: 1, max: 12, step: 1 },
    ],
    code: [
      "var w=ctx.width,h=ctx.height,d=ctx.data,sp=ctx.params.spacing|0,mr=ctx.params.maxRadius|0;",
      "var src=new Uint8ClampedArray(d);",
      "for(var i=0;i<d.length;i++){d[i]=255;}",
      "var seed=(w*73856093)^(h*19349663)^0x9e3779b9;",
      "var rand=function(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};",
      "var scale=Math.max(0.5,Math.min(w,h)/1024);",
      "sp=Math.max(2,sp*scale);var minR=0.6*scale,maxR=mr*scale;",
      "for(var y=-sp;y<h+sp;y+=sp){",
      "  for(var x=-sp;x<w+sp;x+=sp){",
      "    var jx=x+(rand()-0.5)*sp*0.9,jy=y+(rand()-0.5)*sp*0.9;",
      "    var sx=Math.min(w-1,Math.max(0,Math.round(jx))),sy=Math.min(h-1,Math.max(0,Math.round(jy)));",
      "    var lum=0.3*src[(sy*w+sx)*4]+0.59*src[(sy*w+sx)*4+1]+0.11*src[(sy*w+sx)*4+2];",
      "    var darkness=1-lum/255;if(darkness<=0.02)continue;",
      "    var gamma=Math.pow(darkness,0.75);if(rand()>gamma)continue;",
      "    var r=minR+(maxR-minR)*gamma*(0.75+rand()*0.5);if(r<0.35)continue;",
      "    var ri=Math.ceil(r),cxi=Math.round(jx),cyi=Math.round(jy);",
      "    for(var dy=-ri;dy<=ri;dy++){var ny=cyi+dy;if(ny<0||ny>=h)continue;",
      "      for(var dx=-ri;dx<=ri;dx++){var nx=cxi+dx;if(nx<0||nx>=w)continue;",
      "        if(dx*dx+dy*dy>r*r)continue;var idx=(ny*w+nx)*4;",
      "        d[idx]=0;d[idx+1]=0;d[idx+2]=0;d[idx+3]=255;",
      "      }",
      "    }",
      "  }",
      "}",
    ].join("\n"),
  },
  {
    id: "builtin.otsu-threshold",
    name: "Otsu Auto-Threshold",
    version: "1.0",
    author: "AI Stencil Magic",
    kind: "filter",
    description: "Automatically finds the optimal black/white threshold using Otsu's method — no guessing.",
    params: [],
    code: [
      "var d=ctx.data;",
      "var hist=new Array(256).fill(0);",
      "for(var i=0;i<d.length;i+=4){",
      "  var lum=Math.round(0.3*d[i]+0.59*d[i+1]+0.11*d[i+2]);",
      "  hist[lum]++;",
      "}",
      "var total=d.length/4,sum=0;",
      "for(var t=0;t<256;t++)sum+=t*hist[t];",
      "var sumB=0,wB=0,maxVar=0,threshold=128;",
      "for(var t2=0;t2<256;t2++){",
      "  wB+=hist[t2];if(wB===0)continue;",
      "  var wF=total-wB;if(wF===0)break;",
      "  sumB+=t2*hist[t2];",
      "  var mB=sumB/wB,mF=(sum-sumB)/wF;",
      "  var v=wB*wF*(mB-mF)*(mB-mF);",
      "  if(v>maxVar){maxVar=v;threshold=t2;}",
      "}",
      "for(var j=0;j<d.length;j+=4){",
      "  var lum2=0.3*d[j]+0.59*d[j+1]+0.11*d[j+2];",
      "  var val=lum2<threshold?0:255;",
      "  d[j]=val;d[j+1]=val;d[j+2]=val;d[j+3]=255;",
      "}",
    ].join("\n"),
  },
  {
    id: "builtin.mirror-symmetry",
    name: "Mirror Symmetry",
    version: "1.1",
    author: "AI Stencil Magic",
    kind: "filter",
    description: "Creates a mirrored copy across the chosen axis — perfect for symmetrical designs (mandalas, butterflies, etc).",
    params: [
      { key: "axis", label: "Axis (horizontal or vertical)", type: "string", default: "horizontal", min: 0, max: 0, step: 0 },
    ],
    code: [
      "var w=ctx.width,h=ctx.height,d=ctx.data;",
      "var vertical = String(ctx.params.axis).toLowerCase().indexOf('vert') === 0;",
      "if (vertical) {",
      "  for(var y=0;y<h/2;y++){",
      "    var sy=h-1-y;",
      "    for(var x=0;x<w;x++){",
      "      var i1=(y*w+x)*4,i2=(sy*w+x)*4;",
      "      d[i2]=d[i1];d[i2+1]=d[i1+1];d[i2+2]=d[i1+2];d[i2+3]=d[i1+3];",
      "    }",
      "  }",
      "} else {",
      "  for(var y2=0;y2<h;y2++){",
      "    for(var x2=0;x2<w/2;x2++){",
      "      var sx=w-1-x2;",
      "      var i1b=(y2*w+x2)*4,i2b=(y2*w+sx)*4;",
      "      d[i2b]=d[i1b];d[i2b+1]=d[i1b+1];d[i2b+2]=d[i1b+2];d[i2b+3]=d[i1b+3];",
      "    }",
      "  }",
      "}",
    ].join("\n"),
  },
  {
    id: "builtin.bilateral-smooth",
    name: "Bilateral Smooth",
    version: "1.0",
    author: "AI Stencil Magic",
    kind: "filter",
    description: "Edge-preserving smoothing — cleans up skin tones and soft areas without blurring lines.",
    params: [
      { key: "radius", label: "Radius", type: "number", default: 3, min: 1, max: 10, step: 1 },
      { key: "threshold", label: "Edge Threshold", type: "number", default: 30, min: 5, max: 80, step: 5 },
    ],
    code: [
      "var w=ctx.width,h=ctx.height,d=ctx.data,rIn=ctx.params.radius|0,th=ctx.params.threshold|0;",
      "var maxOps=6000000;",
      "var r=rIn;",
      "while(r>1 && w*h*(2*r+1)*(2*r+1)>maxOps){r--;}",
      "var out=new Uint8ClampedArray(d.length);",
      "for(var y=0;y<h;y++)for(var x=0;x<w;x++){",
      "  var i=(y*w+x)*4;",
      "  var cr=d[i],cg=d[i+1],cb=d[i+2];",
      "  var sr=0,sg=0,sb=0,c=0;",
      "  for(var dy=-r;dy<=r;dy++)for(var dx=-r;dx<=r;dx++){",
      "    var nx=x+dx,ny=y+dy;",
      "    if(nx<0||nx>=w||ny<0||ny>=h)continue;",
      "    var j=(ny*w+nx)*4;",
      "    var diff=Math.abs(d[j]-cr)+Math.abs(d[j+1]-cg)+Math.abs(d[j+2]-cb);",
      "    if(diff<th*3){sr+=d[j];sg+=d[j+1];sb+=d[j+2];c++;}",
      "  }",
      "  out[i]=c>0?sr/c:cr;out[i+1]=c>0?sg/c:cg;out[i+2]=c>0?sb/c:cb;out[i+3]=255;",
      "}",
      "for(var k=0;k<d.length;k++)d[k]=out[k];",
    ].join("\n"),
  },
];
