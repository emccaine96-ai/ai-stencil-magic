/**
 * Module 1 — Non-destructive pipeline cache.
 * Each stage only recomputes when its own params (or an upstream stage
 * it reads from) actually changed.
 */

export interface ImageBuffer {
  width: number;
  height: number;
  data: Float32Array;
  channels: 1 | 4;
}

export type StageKey =
  | 'normalized' | 'grayscale' | 'bands' | 'edges' | 'toneIdx'
  | 'regionMask' | 'regionParams' | 'lineLayer' | 'hatchLayer'
  | 'cleanupLayer' | 'finalStencil';

interface StageEntry<T = unknown> {
  value: T;
  paramsHash: string;
}

export class PipelineCache {
  private stages = new Map<StageKey, StageEntry>();

  get<T>(key: StageKey, paramsHash: string): T | undefined {
    const entry = this.stages.get(key);
    if (!entry || entry.paramsHash !== paramsHash) return undefined;
    return entry.value as T;
  }

  set<T>(key: StageKey, value: T, paramsHash: string) {
    this.stages.set(key, { value, paramsHash });
  }

  invalidateFrom(...keys: StageKey[]) {
    for (const k of keys) this.stages.delete(k);
  }

  clear() {
    this.stages.clear();
  }
}

export function hashParams(params: Record<string, unknown>): string {
  return JSON.stringify(params, Object.keys(params).sort());
}
