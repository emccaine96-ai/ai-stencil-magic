import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { buildToneCurveLUT, type CurveNode } from "@/lib/touch-up/tone-curve";

type Props = {
  nodes: CurveNode[];
  onChange: (nodes: CurveNode[]) => void;
  className?: string;
};

const R = 255;

/**
 * Interactive tone curve: drag any control point, tap empty grid space to add
 * one, double-tap a middle point to remove it. The rendered line is the same
 * cubic-spline LUT that gets applied to ink density, so the graph never lies
 * about the result.
 */
export function CurveEditor({ nodes, onChange, className }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<number | null>(null);

  const lut = buildToneCurveLUT(nodes);
  const path = Array.from(lut, (y, x) => `${x},${R - y}`).join(" ");

  const toCurve = useCallback((e: ReactPointerEvent) => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * R;
    const y = R - ((e.clientY - rect.top) / rect.height) * R;
    return { x: Math.max(0, Math.min(R, x)), y: Math.max(0, Math.min(R, y)) };
  }, []);

  function onDown(e: ReactPointerEvent<SVGSVGElement>) {
    const p = toCurve(e);
    let nearest = -1;
    let best = Infinity;
    nodes.forEach((n, i) => {
      const d = Math.hypot(n.x - p.x, n.y - p.y);
      if (d < best) {
        best = d;
        nearest = i;
      }
    });
    if (best <= 18) {
      dragRef.current = nearest;
    } else {
      const next = [...nodes, { x: Math.round(p.x), y: Math.round(p.y) }].sort((a, b) => a.x - b.x);
      dragRef.current = next.findIndex((n) => n.x === Math.round(p.x) && n.y === Math.round(p.y));
      onChange(next);
    }
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
  }

  function onMove(e: ReactPointerEvent<SVGSVGElement>) {
    const i = dragRef.current;
    if (i === null || i < 0) return;
    const p = toCurve(e);
    const next = nodes.map((n, idx) => {
      if (idx !== i) return n;
      // Endpoints keep their x pinned so the curve always spans 0..255.
      const isFirst = idx === 0;
      const isLast = idx === nodes.length - 1;
      const minX = isFirst ? 0 : (nodes[idx - 1]?.x ?? 0) + 2;
      const maxX = isLast ? R : (nodes[idx + 1]?.x ?? R) - 2;
      const x = isFirst ? 0 : isLast ? R : Math.max(minX, Math.min(maxX, Math.round(p.x)));
      return { x, y: Math.round(p.y) };
    });
    onChange(next);
  }

  function onUp() {
    dragRef.current = null;
  }

  function removePoint(i: number) {
    if (i === 0 || i === nodes.length - 1 || nodes.length <= 2) return;
    onChange(nodes.filter((_, idx) => idx !== i));
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`-8 -8 ${R + 16} ${R + 16}`}
      className={className ?? "w-full aspect-square touch-none rounded-xl bg-black/40"}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {[0, 64, 128, 192, 255].map((g) => (
        <g key={g} className="text-white/10">
          <line x1={g} y1={0} x2={g} y2={R} stroke="currentColor" strokeWidth={1} />
          <line x1={0} y1={g} x2={R} y2={g} stroke="currentColor" strokeWidth={1} />
        </g>
      ))}
      <line x1={0} y1={R} x2={R} y2={0} stroke="currentColor" strokeWidth={1} className="text-white/10" />
      <polyline fill="none" stroke="currentColor" strokeWidth={4} points={path} className="text-primary" strokeLinecap="round" />
      {nodes.map((n, i) => (
        <circle
          key={`${i}-${n.x}`}
          cx={n.x}
          cy={R - n.y}
          r={7}
          className="fill-primary stroke-white"
          strokeWidth={2}
          onDoubleClick={() => removePoint(i)}
        />
      ))}
    </svg>
  );
}
