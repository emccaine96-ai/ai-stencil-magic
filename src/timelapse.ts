// src/timelapse.ts
// Lightweight time-lapse scaffold: captures stroke events with timestamps.

export type StrokePoint = { x:number; y:number; t:number };
export type Stroke = { id:string; points: StrokePoint[] };
const strokes: Stroke[] = [];

export function startStroke(id:string) { strokes.push({id, points: []}); }
export function addPointToStroke(id:string, x:number, y:number) {
  const s = strokes.find(s => s.id === id);
  if (!s) return;
  s.points.push({ x, y, t: Date.now() });
}
export function exportTimelapse() {
  return JSON.stringify(strokes);
}
