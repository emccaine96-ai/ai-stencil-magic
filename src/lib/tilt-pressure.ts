/**
 * Phase 6 Wave 6 — Tilt, area and pressure normalization across pointer
 * sources (Apple Pencil, S-Pen, generic stylus, capacitive touch). Adds
 * synthesized pressure on hardware that doesn't report it.
 */

export type RichPointer = {
  x: number; y: number;
  pressure: number;       // 0..1
  tiltX: number;          // -90..90
  tiltY: number;          // -90..90
  twist: number;          // 0..360
  azimuth: number;        // rad — derived from tilt
  altitude: number;       // rad — derived from tilt
  radius: number;         // px — finger contact radius
  type: "pen" | "touch" | "mouse";
  velocity: number;       // px/ms
  t: number;
};

let lastSample: RichPointer | null = null;

export function readPointer(e: PointerEvent, rect: DOMRect, scale = 1): RichPointer {
  const x = (e.clientX - rect.left) / scale;
  const y = (e.clientY - rect.top) / scale;
  const t = performance.now();
  const tiltX = (e as any).tiltX ?? 0;
  const tiltY = (e as any).tiltY ?? 0;
  // Azimuth & altitude (radians) for Procreate-style brush tilt rendering.
  const tx = (tiltX * Math.PI) / 180;
  const ty = (tiltY * Math.PI) / 180;
  const altitude = Math.PI / 2 - Math.atan(Math.hypot(Math.tan(tx), Math.tan(ty)));
  const azimuth = Math.atan2(Math.tan(ty), Math.tan(tx));

  const radius = Math.max(e.width || 0, e.height || 0) / 2;
  const dt = lastSample ? Math.max(1, t - lastSample.t) : 16;
  const velocity = lastSample ? Math.hypot(x - lastSample.x, y - lastSample.y) / dt : 0;

  let pressure = e.pressure > 0 ? e.pressure : 0;
  if (e.pressure === 0 || e.pressure === 0.5) {
    // Synthesize from velocity + area
    const v = Math.min(1, velocity / 3);
    const a = Math.min(1, radius / 24);
    pressure = Math.max(0.15, (1 - v * 0.6) * (0.7 + a * 0.3));
  }

  const out: RichPointer = {
    x, y, pressure,
    tiltX, tiltY,
    twist: (e as any).twist ?? 0,
    azimuth, altitude, radius,
    type: (e.pointerType as RichPointer["type"]) || "mouse",
    velocity, t,
  };
  lastSample = out;
  return out;
}

export function resetPointerSampler() { lastSample = null; }

/** Compute brush stamp ellipse from tilt: tilted pen leaves a wider stamp on the trailing side. */
export function stampTilt(p: RichPointer, baseRadius: number) {
  const tiltMag = Math.min(1, Math.hypot(p.tiltX, p.tiltY) / 60);
  const angle = Math.atan2(p.tiltY, p.tiltX);
  const major = baseRadius * (1 + tiltMag * 0.6);
  const minor = baseRadius * (1 - tiltMag * 0.35);
  return { angle, major, minor };
}
