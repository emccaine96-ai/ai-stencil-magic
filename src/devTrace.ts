// src/devTrace.ts
// Small dev diagnostic trace scaffold that records pointer and viewport events

type TraceEvent = { t:number; type:string; data:any };
const trace: TraceEvent[] = [];
let tracing = false;

export function startTrace() { trace.length = 0; tracing = true; }
export function stopTrace() { tracing = false; }
export function recordEvent(type:string, data:any) {
  if (!tracing) return;
  trace.push({ t: Date.now(), type, data });
}
export function downloadTrace(filename = 'dev-trace.json') {
  const blob = new Blob([JSON.stringify(trace, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export { trace };
