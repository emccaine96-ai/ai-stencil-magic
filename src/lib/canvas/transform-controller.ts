/**
 * Free transform controller: move / scale / rotate a rectangular region.
 * Framework-agnostic — hand it pointer events, get back a matrix.
 *
 *   const tc = new TransformController({ x, y, w, h });
 *   tc.pointerDown(px, py);      // returns hit type
 *   tc.pointerMove(px, py);      // updates transform
 *   tc.pointerUp();
 *   ctx.setTransform(...tc.matrix());
 */

export type Handle =
  | "move" | "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rotate" | null;

export interface TransformState {
  x: number; y: number;         // top-left in world coords
  w: number; h: number;         // size (unscaled)
  scaleX: number; scaleY: number;
  rotation: number;             // radians
}

export class TransformController {
  state: TransformState;
  private active: Handle = null;
  private start = { px: 0, py: 0, state: null as TransformState | null };
  handleSize = 12;
  rotateOffset = 28;

  constructor(init: { x: number; y: number; w: number; h: number }) {
    this.state = { ...init, scaleX: 1, scaleY: 1, rotation: 0 };
  }

  /** Column-major 2x3 affine [a,b,c,d,e,f] for ctx.setTransform. */
  matrix(): [number, number, number, number, number, number] {
    const { x, y, w, h, scaleX, scaleY, rotation } = this.state;
    const cx = x + w / 2, cy = y + h / 2;
    const cos = Math.cos(rotation), sin = Math.sin(rotation);
    const a = cos * scaleX, b = sin * scaleX;
    const c = -sin * scaleY, d = cos * scaleY;
    const e = cx - (a * (w / 2) + c * (h / 2));
    const f = cy - (b * (w / 2) + d * (h / 2));
    return [a, b, c, d, e, f];
  }

  /** World coords of the 4 corners + rotate handle. */
  handles(): Record<Exclude<Handle, null | "move">, { x: number; y: number }> {
    const [a, b, c, d, e, f] = this.matrix();
    const { w, h } = this.state;
    const p = (u: number, v: number) => ({ x: a * u + c * v + e, y: b * u + d * v + f });
    const nw = p(0, 0), ne = p(w, 0), se = p(w, h), sw = p(0, h);
    const n = p(w / 2, 0), s = p(w / 2, h), wH = p(0, h / 2), eH = p(w, h / 2);
    const nrm = Math.hypot(n.x - s.x, n.y - s.y) || 1;
    const ux = (n.x - s.x) / nrm, uy = (n.y - s.y) / nrm;
    return {
      nw, n, ne, e: eH, se, s, sw, w: wH,
      rotate: { x: n.x + ux * this.rotateOffset, y: n.y + uy * this.rotateOffset },
    };
  }

  private hit(px: number, py: number): Handle {
    const hs = this.handleSize;
    const hs2 = hs * hs;
    const near = (h: { x: number; y: number }) =>
      (px - h.x) ** 2 + (py - h.y) ** 2 < hs2;
    const hs_ = this.handles();
    for (const k of ["rotate", "nw", "ne", "se", "sw", "n", "e", "s", "w"] as const) {
      if (near(hs_[k])) return k;
    }
    // inside bounding box → move
    const { nw, ne, se, sw } = hs_;
    if (pointInQuad(px, py, nw, ne, se, sw)) return "move";
    return null;
  }

  pointerDown(px: number, py: number): Handle {
    this.active = this.hit(px, py);
    this.start = { px, py, state: { ...this.state } };
    return this.active;
  }

  pointerMove(px: number, py: number): boolean {
    if (!this.active || !this.start.state) return false;
    const s0 = this.start.state;
    const dx = px - this.start.px, dy = py - this.start.py;
    if (this.active === "move") {
      this.state.x = s0.x + dx;
      this.state.y = s0.y + dy;
    } else if (this.active === "rotate") {
      const cx = s0.x + s0.w / 2, cy = s0.y + s0.h / 2;
      const a0 = Math.atan2(this.start.py - cy, this.start.px - cx);
      const a1 = Math.atan2(py - cy, px - cx);
      this.state.rotation = s0.rotation + (a1 - a0);
    } else {
      // corner/edge scale (uniform on corners, axis on edges)
      const cx = s0.x + s0.w / 2, cy = s0.y + s0.h / 2;
      const rx0 = this.start.px - cx, ry0 = this.start.py - cy;
      const rx1 = px - cx, ry1 = py - cy;
      const ex = /w|e/.test(this.active) || /nw|ne|sw|se/.test(this.active);
      const ey = /n|s/.test(this.active) || /nw|ne|sw|se/.test(this.active);
      if (ex) this.state.scaleX = s0.scaleX * safeRatio(rx1, rx0);
      if (ey) this.state.scaleY = s0.scaleY * safeRatio(ry1, ry0);
      if (/nw|ne|sw|se/.test(this.active)) {
        // keep uniform scaling on corners
        const u = (Math.abs(this.state.scaleX / s0.scaleX) + Math.abs(this.state.scaleY / s0.scaleY)) / 2;
        this.state.scaleX = s0.scaleX * Math.sign(this.state.scaleX / s0.scaleX || 1) * u;
        this.state.scaleY = s0.scaleY * Math.sign(this.state.scaleY / s0.scaleY || 1) * u;
      }
    }
    return true;
  }

  pointerUp() {
    this.active = null;
    this.start.state = null;
  }

  reset(next?: Partial<TransformState>) {
    this.state = { ...this.state, ...next };
  }
}

function safeRatio(a: number, b: number) {
  if (Math.abs(b) < 0.5) return 1;
  return a / b;
}

function pointInQuad(
  px: number, py: number,
  a: { x: number; y: number }, b: { x: number; y: number },
  c: { x: number; y: number }, d: { x: number; y: number },
) {
  const sign = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
    (px - r.x) * (p.y - r.y) - (p.x - r.x) * (py - r.y) > 0
      ? 1
      : (px - r.x) * (p.y - r.y) - (p.x - r.x) * (py - r.y) < 0 ? -1 : 0;
  const s1 = sign(a, b, a);
  // Simpler: split quad into two triangles a-b-c and a-c-d
  return triContains(px, py, a, b, c) || triContains(px, py, a, c, d) || s1 === 0;
}
function triContains(px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
  const d1 = (px - b.x) * (a.y - b.y) - (a.x - b.x) * (py - b.y);
  const d2 = (px - c.x) * (b.y - c.y) - (b.x - c.x) * (py - c.y);
  const d3 = (px - a.x) * (c.y - a.y) - (c.x - a.x) * (py - a.y);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}