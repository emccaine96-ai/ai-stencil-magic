// Lightweight 4-state Kalman filter for stylus input smoothing.
// State: [x, y, vx, vy]. Observes (x, y). Pressure is smoothed separately
// with a 1-D Kalman to keep the API simple and CPU cheap.

export type SmoothedPoint = { x: number; y: number; pressure: number; t: number };

export class InputSmoother {
  // 2D position+velocity Kalman
  private x = 0; private y = 0; private vx = 0; private vy = 0;
  // Covariance diagonal approximation
  private p = [1, 1, 1, 1];
  private q = 0.02;          // process noise
  private r = 0.6;           // measurement noise — higher = smoother / laggier
  // Pressure 1D Kalman
  private pp = 0.5; private ppCov = 1;
  private pq = 0.02; private pr = 0.4;
  private lastT = 0;
  private initialised = false;

  reset() {
    this.initialised = false;
    this.p = [1, 1, 1, 1];
    this.ppCov = 1;
  }

  setSmoothing(amount: number) {
    // amount 0..1 — higher = smoother
    this.r = 0.05 + amount * 1.5;
    this.pr = 0.05 + amount * 1.0;
  }

  push(xMeas: number, yMeas: number, pressureMeas: number, t: number): SmoothedPoint {
    if (!this.initialised) {
      this.x = xMeas; this.y = yMeas; this.vx = 0; this.vy = 0;
      this.pp = pressureMeas;
      this.lastT = t;
      this.initialised = true;
      return { x: xMeas, y: yMeas, pressure: pressureMeas, t };
    }
    const dt = Math.max(1, t - this.lastT) / 16;
    this.lastT = t;

    // Predict
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.p[0] += this.q;
    this.p[1] += this.q;
    this.p[2] += this.q;
    this.p[3] += this.q;

    // Update X
    const kx = this.p[0] / (this.p[0] + this.r);
    const rx = xMeas - this.x;
    this.x += kx * rx;
    this.vx += (kx * rx) / dt * 0.4;
    this.p[0] *= (1 - kx);

    const ky = this.p[1] / (this.p[1] + this.r);
    const ry = yMeas - this.y;
    this.y += ky * ry;
    this.vy += (ky * ry) / dt * 0.4;
    this.p[1] *= (1 - ky);

    // Pressure
    this.ppCov += this.pq;
    const kp = this.ppCov / (this.ppCov + this.pr);
    this.pp += kp * (pressureMeas - this.pp);
    this.ppCov *= (1 - kp);

    return { x: this.x, y: this.y, pressure: Math.min(1, Math.max(0, this.pp)), t };
  }
}

/** Velocity-derived pressure for mouse/touch without native pressure. */
export function estimatePressureFromVelocity(prev: SmoothedPoint | null, x: number, y: number, t: number): number {
  if (!prev) return 0.6;
  const dt = Math.max(1, t - prev.t);
  const v = Math.hypot(x - prev.x, y - prev.y) / dt; // px/ms
  // Map: slow stroke (v≈0) → 1.0, fast (v≈3+ px/ms) → 0.25
  const p = 1 - Math.min(1, v / 3) * 0.75;
  return p;
}