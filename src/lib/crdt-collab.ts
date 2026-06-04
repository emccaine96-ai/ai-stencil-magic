/**
 * Phase 6 Wave 4 — Lightweight op-based CRDT for collaborative strokes.
 * Pure-JS (zero dependency) alternative to Yjs that piggybacks on the
 * existing collab.ts Supabase Realtime transport. Strokes are immutable,
 * keyed by (siteId, lamport) — order is deterministic across peers.
 */

export type StrokeOp = {
  kind: "stroke";
  siteId: string;
  lamport: number;
  brushId: string;
  color: string;
  points: { x: number; y: number; p: number }[];
  layerId: string;
};
export type EraseOp = {
  kind: "erase";
  siteId: string;
  lamport: number;
  targetId: string; // "siteId:lamport" of stroke to remove
};
export type Op = StrokeOp | EraseOp;

export class CRDTDocument {
  readonly siteId: string;
  private clock = 0;
  private ops = new Map<string, Op>();
  private listeners = new Set<(op: Op) => void>();

  constructor(siteId = crypto.randomUUID()) { this.siteId = siteId; }

  private key(op: Op) { return op.siteId + ":" + op.lamport; }

  tick() { return ++this.clock; }

  apply(op: Op): boolean {
    const k = this.key(op);
    if (this.ops.has(k)) return false;
    this.ops.set(k, op);
    if (op.lamport > this.clock) this.clock = op.lamport;
    this.listeners.forEach((l) => l(op));
    return true;
  }

  emitStroke(o: Omit<StrokeOp, "kind" | "siteId" | "lamport">): StrokeOp {
    const op: StrokeOp = { ...o, kind: "stroke", siteId: this.siteId, lamport: this.tick() };
    this.apply(op);
    return op;
  }

  emitErase(targetId: string): EraseOp {
    const op: EraseOp = { kind: "erase", siteId: this.siteId, lamport: this.tick(), targetId };
    this.apply(op);
    return op;
  }

  onOp(fn: (op: Op) => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** Deterministic ordered list — strokes minus erased. */
  resolved(): StrokeOp[] {
    const erased = new Set<string>();
    for (const op of this.ops.values()) if (op.kind === "erase") erased.add(op.targetId);
    const strokes: StrokeOp[] = [];
    for (const op of this.ops.values()) {
      if (op.kind === "stroke" && !erased.has(this.key(op))) strokes.push(op);
    }
    strokes.sort((a, b) => a.lamport - b.lamport || a.siteId.localeCompare(b.siteId));
    return strokes;
  }

  /** Compact wire snapshot for cold-loading a peer. */
  snapshot(): Op[] { return Array.from(this.ops.values()); }
  loadSnapshot(ops: Op[]) { for (const op of ops) this.apply(op); }
}
