import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef } from "react";

export type RadialItem = { id: string; label: string; icon: React.ReactNode; onPick: () => void };

type Props = {
  open: boolean;
  x: number;
  y: number;
  items: RadialItem[];
  onClose: () => void;
};

/** Procreate-style ring menu — appears under finger/cursor on long-press. */
export function RadialMenu({ open, x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open, onClose]);

  const radius = 86;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ type: "spring", stiffness: 320, damping: 22 }}
          className="fixed z-[100] pointer-events-auto"
          style={{
            left: x - radius - 32,
            top: y - radius - 32,
            width: (radius + 32) * 2,
            height: (radius + 32) * 2,
          }}
        >
          <div className="absolute inset-0 rounded-full bg-background/80 backdrop-blur-xl border border-border shadow-2xl" />
          {items.map((it, i) => {
            const a = (i / items.length) * Math.PI * 2 - Math.PI / 2;
            const px = radius + 32 + Math.cos(a) * radius - 24;
            const py = radius + 32 + Math.sin(a) * radius - 24;
            return (
              <motion.button
                key={it.id}
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.92 }}
                className="absolute w-12 h-12 rounded-full bg-primary/15 hover:bg-primary/30 border border-primary/40 flex items-center justify-center text-foreground"
                style={{ left: px, top: py }}
                onClick={() => {
                  it.onPick();
                  onClose();
                }}
                title={it.label}
              >
                {it.icon}
              </motion.button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
