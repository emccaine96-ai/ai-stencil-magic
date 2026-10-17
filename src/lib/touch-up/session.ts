/**
 * Touch-Up Studio session payload.
 * Extends the existing sessionStorage hand-off (primalprint.touchup.load /
 * .current) with the original photo + generation config so Smart Erase can
 * re-invoke the same engine. Existing keys are unchanged.
 */

export type TouchUpEngine = "classical" | "hybrid" | "openrouter" | "gemini";
export type TouchUpStyle = "hatching" | "solid" | "dotwork" | "hybrid";
export type TouchUpBackgroundMode = "keep" | "remove" | "fade";

export interface TouchUpGenConfig {
  engine: TouchUpEngine;
  style: TouchUpStyle;
  intensity: number;
  useRetinex: boolean;
  backgroundMode: TouchUpBackgroundMode;
  useAdvancedPipeline: boolean;
}

export interface TouchUpPayload {
  stencil: string;
  photo?: string | null;
  inkColor?: string;
  config?: TouchUpGenConfig;
}

export const TOUCHUP_LOAD_KEY = "primalprint.touchup.load";
export const TOUCHUP_CURRENT_KEY = "primalprint.touchup.current";
export const TOUCHUP_AUTOSAVE_KEY = "primalprint.touchup.autosave";

export interface TouchUpAutosave {
  edited: string;
  source: string;
  photo?: string | null;
  config?: TouchUpGenConfig;
  inkColorId?: string;
  customHex?: string;
}

export function readJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): boolean {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
