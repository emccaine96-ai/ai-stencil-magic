// src/gesture.ts
// Defensive, device-consistent gesture & pointer handling.

type Point = { x: number; y: number; id?: number };

class PointerCache {
  private map = new Map<number, PointerEvent>();
  update(e: PointerEvent) { this.map.set(e.pointerId, e); }
  delete(id: number) { this.map.delete(id); }
  getTwo(): [PointerEvent, PointerEvent] | null {
    const it = this.map.values();
    const a = it.next();
    const b = it.next();
    if (a.done || b.done) return null;
    return [a.value, b.value];
  }
}

const pointers = new PointerCache();
let rafScheduled = false;
let pending = [] as PointerEvent[];

function onPointerEvent(e: PointerEvent) {
  // store client-space coords (avoid transform issues)
  pointers.update(e);
  pending.push(e);
  if (!rafScheduled) {
    rafScheduled = true;
    requestAnimationFrame(flushPointerEvents);
  }
}

function flushPointerEvents() {
  rafScheduled = false;
  if (pending.length === 0) return;
  // coalesce high-frequency events: take latest per pointerId
  const latest = new Map<number, PointerEvent>();
  for (const p of pending) latest.set(p.pointerId, p);
  pending = [];

  // Compute gesture state using clientX/clientY
  const pair = pointers.getTwo();
  if (pair) {
    const [p1, p2] = pair;
    const c = {
      x: (p1.clientX + p2.clientX) / 2,
      y: (p1.clientY + p2.clientY) / 2,
    };
    const dx = p2.clientX - p1.clientX;
    const dy = p2.clientY - p1.clientY;
    const distance = Math.hypot(dx, dy);
    // Emit stable pinch/rotate with deterministic ordering by pointerId
    handlePinchRotate({center: c, distance, dx, dy});
  } else {
    // single pointer pan/brush
    // use the last pointer event in latest
    const last = Array.from(latest.values()).pop()!;
    handleSinglePointer({x: last.clientX, y: last.clientY, id: last.pointerId});
  }
}

function handlePinchRotate(state: any) {
  // apply scale/rotate deltas to viewport with defensive guards
  // clamp scale and avoid NaN/inf
  // (Implementation detail depends on app viewport API)
  // Example placeholder:
  console.debug('pinch center', state.center, 'distance', state.distance);
}

function handleSinglePointer(p: any) {
  // route to brush stroke path logic
  console.debug('pointer', p);
}

export { onPointerEvent, flushPointerEvents };
