// src/lib/classical-v3/engine-api.ts
/**
 * Stable names for the V3 engine, so the worker, hook, controls panel and test harness do not depend on
 * which revision of hectograph-engine.ts is installed.
 *
 * hectograph-engine.ts is the pure algorithm (currently V3.2) and is replaced wholesale when the algorithm
 * is upgraded. Everything else imports from HERE, so an upgrade is a drop-in file swap.
 */
import {
  DEFAULT_HECTOGRAPH_V3_CONFIG,
  renderHectographStencilV3,
  type HectographV3Config,
  type HectographOutputMode,
} from './hectograph-engine';

export type { HectographV3Config, HectographOutputMode };

/** Default configuration (the engine's own defaults). */
export const HECTOGRAPH_V3_DEFAULT_CONFIG: HectographV3Config = DEFAULT_HECTOGRAPH_V3_CONFIG;

/** Render a photo (RGBA ImageData) to an opaque hectograph stencil on white paper. */
export function renderHectographV3(image: ImageData, config: Partial<HectographV3Config> = {}): ImageData {
  return renderHectographStencilV3(image, config);
}
