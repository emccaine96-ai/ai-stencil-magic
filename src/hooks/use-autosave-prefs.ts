import { useCallback, useEffect, useState } from "react";

const KEY_ENABLED = "pp.autosave.enabled";
const KEY_INTERVAL = "pp.autosave.intervalMs";

export const AUTOSAVE_INTERVALS = [
  { label: "5 min", ms: 5 * 60_000 },
  { label: "10 min", ms: 10 * 60_000 },
  { label: "15 min", ms: 15 * 60_000 },
] as const;

const DEFAULT_INTERVAL_MS = AUTOSAVE_INTERVALS[0].ms;

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    if (v === null) return fallback;
    return v === "1" || v === "true";
  } catch {
    return fallback;
  }
}

function readNum(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  try {
    const v = window.localStorage.getItem(key);
    if (v === null) return fallback;
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

/** User-tunable autosave preferences. Persisted in localStorage so the
 *  choice survives reloads and applies across every document. */
export function useAutosavePrefs() {
  const [enabled, setEnabledState] = useState<boolean>(() => readBool(KEY_ENABLED, true));
  const [intervalMs, setIntervalMsState] = useState<number>(() =>
    readNum(KEY_INTERVAL, DEFAULT_INTERVAL_MS),
  );

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    try {
      window.localStorage.setItem(KEY_ENABLED, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const setIntervalMs = useCallback((ms: number) => {
    setIntervalMsState(ms);
    try {
      window.localStorage.setItem(KEY_INTERVAL, String(ms));
    } catch {
      /* ignore */
    }
  }, []);

  // Cross-tab sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY_ENABLED) setEnabledState(readBool(KEY_ENABLED, true));
      if (e.key === KEY_INTERVAL) setIntervalMsState(readNum(KEY_INTERVAL, DEFAULT_INTERVAL_MS));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { enabled, intervalMs, setEnabled, setIntervalMs };
}
