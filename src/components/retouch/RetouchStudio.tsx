/**
 * Retouch Studio — Phase 1 (SHELL) only.
 *
 * Focused post-generation retouch surface. Two modes:
 *  - Retouch Mode: full-bleed white canvas, purple stencil, six tools (later phases).
 *  - Tattoo Mode: layered chair reference, filmstrip, per-layer adjustments (later phases).
 *
 * This file intentionally contains NO tool logic — only the mode-switch scaffold,
 * the canvas mount point, and the IndexedDB handoff promotion on mount.
 *
 * Reused (audit-confirmed, nothing rewritten):
 *  - src/lib/touch-up/handoff.ts  — takeHandoff() / writeCurrent() / readCurrent()
 *  - src/lib/touch-up/session.ts  — TouchUpPayload type
 */
import { useEffect, useState } from "react";
import { takeHandoff, writeCurrent } from "@/lib/touch-up/handoff";
import type { TouchUpPayload } from "@/lib/touch-up/session";
import { RetouchCanvas } from "./RetouchCanvas";

export type RetouchMode = "retouch" | "tattoo";

export function RetouchStudio() {
  // Canvas mount point lives in RetouchCanvas (Phase 2).
  const [mode, setMode] = useState<RetouchMode>("retouch");
  const [payload, setPayload] = useState<TouchUpPayload | null>(null);

  // On mount: promote the pending handoff to the current session.
  // handoff.ts API (verified by direct read): takeHandoff() reads
  // handoff["pending"], deletes it, and returns the payload; writeCurrent()
  // persists handoff["current"]. SessionStorage fallback keys are honoured
  // by the caller of writeHandoff, not here.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const pending = await takeHandoff();
      if (cancelled) return;
      if (pending) {
        await writeCurrent(pending);
        setPayload(pending);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-background text-foreground flex flex-col">
      {/* Mode switch — scaffold only, no tool logic yet */}
      <div className="flex items-center justify-center gap-2 p-2">
        <button
          type="button"
          onClick={() => setMode("retouch")}
          className={mode === "retouch" ? "font-bold" : "opacity-60"}
        >
          Retouch Mode
        </button>
        <button
          type="button"
          onClick={() => setMode("tattoo")}
          className={mode === "tattoo" ? "font-bold" : "opacity-60"}
        >
          Tattoo Mode
        </button>
      </div>

      {/* Canvas mount point — full-bleed surface for later phases */}
      <div className="relative flex-1">
        <RetouchCanvas payload={payload} />
        {!payload && (
          <div className="absolute inset-0 flex items-center justify-center text-sm opacity-60">
            No stencil handed off yet.
          </div>
        )}
      </div>
    </div>
  );
}

export default RetouchStudio;
