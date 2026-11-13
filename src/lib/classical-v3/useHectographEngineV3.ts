// src/lib/classical-v3/useHectographEngineV3.ts
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  HECTOGRAPH_V3_DEFAULT_CONFIG,
  type HectographV3Config,
} from './engine-api';
import type { WorkerRenderRequest, WorkerResponse } from './stencil-render.worker';

export type StencilPresetId =
  | 'tattoo-clean' // cleaner, sparser lines that pass the app's tattooability check
  | 'hectograph-rich' // multi-tone purple transfer sheet
  | 'floral-botanical' // high micro-vein recovery for petals
  | 'portrait-realism' // smooth skin, directional shading, crisp eyes and lips
  | 'aztec-geometric' // precise centerline ridges, low shading
  | 'one-bit'; // 1-bit black and white output (not validated against any specific printer)

export const STENCIL_V3_PRESETS: Record<
  StencilPresetId,
  { label: string; description: string; config: HectographV3Config }
> = {
  'tattoo-clean': {
    label: 'Tattoo Clean (recommended)',
    description: 'Sparser single-spine lines and open paper. Scored 70+ on the built-in tattooability check.',
    config: {
      outputMode: 'hectograph-purple',
      anchorWeight: 1.25,
      fineDetailGain: 1.15,
      flowShadingStrength: 0,
      localContrastBoost: 0.3,
      haloProtection: 1.5,
    },
  },
  'hectograph-rich': {
    label: 'Hectograph Rich (Purple)',
    description: 'Fuller multi-tone look with engraving strokes. Denser, so it scores lower on tattooability.',
    config: {
      outputMode: 'hectograph-purple',
      anchorWeight: 1.3,
      fineDetailGain: 1.2,
      flowShadingStrength: 0.58,
      localContrastBoost: 0.78,
      haloProtection: 1.5,
    },
  },
  'floral-botanical': {
    label: 'Botanical & Petal Veins',
    description: 'Extracts faint white-on-white petal striations while opening up dark leaves',
    config: {
      outputMode: 'hectograph-purple',
      anchorWeight: 1.15,
      fineDetailGain: 1.65,
      flowShadingStrength: 0.45,
      localContrastBoost: 0.92,
      haloProtection: 1.2,
    },
  },
  'portrait-realism': {
    label: 'Portrait & Skin Contours',
    description: 'Single-spine wrinkles, clean negative space on cheeks, soft contour shading',
    config: {
      outputMode: 'hectograph-purple',
      anchorWeight: 1.25,
      fineDetailGain: 0.95,
      flowShadingStrength: 0.65,
      localContrastBoost: 0.68,
      haloProtection: 2.0,
    },
  },
  'aztec-geometric': {
    label: 'Micro-Glyph & Ornamental',
    description: 'Crisp single-pixel centerlines for intricate carvings and mandalas',
    config: {
      outputMode: 'hectograph-purple',
      anchorWeight: 1.45,
      fineDetailGain: 1.5,
      flowShadingStrength: 0.2,
      localContrastBoost: 0.85,
      haloProtection: 1.0,
    },
  },
  'one-bit': {
    label: '1-bit Black & White',
    description: 'No grey tones. Shading becomes fine dots. Not yet validated on any specific thermal printer.',
    config: {
      outputMode: 'thermal-binary',
      anchorWeight: 1.35,
      fineDetailGain: 1.1,
      flowShadingStrength: 0.35,
      localContrastBoost: 0.75,
      haloProtection: 2.2,
    },
  },
};

export interface RenderStencilV3Options {
  config?: Partial<HectographV3Config>;
}

export function useHectographEngineV3() {
  const workerRef = useRef<Worker | null>(null);
  const latestJobIdRef = useRef(0);
  /** rejects the in-flight render if the component unmounts or a newer render supersedes it */
  const cancelInFlightRef = useRef<((reason: string) => void) | null>(null);

  const [isRendering, setIsRendering] = useState(false);
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      cancelInFlightRef.current?.('Stencil engine closed');
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  /** the worker is created on first use, so pages that never render V3 never start it */
  const getWorker = useCallback((): Worker => {
    if (!workerRef.current) {
      workerRef.current = new Worker(new URL('./stencil-render.worker.ts', import.meta.url), {
        type: 'module',
      });
    }
    return workerRef.current;
  }, []);

  const renderStencilV3 = useCallback(
    (sourceImageData: ImageData, options: RenderStencilV3Options = {}): Promise<ImageData> => {
      return new Promise<ImageData>((resolve, reject) => {
        let worker: Worker;
        try {
          worker = getWorker();
        } catch (e) {
          reject(e instanceof Error ? e : new Error('Stencil worker could not start'));
          return;
        }

        // a newer render supersedes any one still running
        cancelInFlightRef.current?.('Superseded by a newer render');

        const jobId = ++latestJobIdRef.current;
        setIsRendering(true);
        setError(null);

        // copy the pixels so the source ImageData (and its canvas) stays intact after the transfer
        const clonedBuffer = new Uint8ClampedArray(sourceImageData.data).buffer as ArrayBuffer;

        const cleanup = () => {
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleWorkerError);
          if (cancelInFlightRef.current === cancel) cancelInFlightRef.current = null;
        };

        const cancel = (reason: string) => {
          cleanup();
          reject(new Error(reason));
        };
        cancelInFlightRef.current = cancel;

        const handleWorkerError = (e: ErrorEvent) => {
          cleanup();
          setIsRendering(false);
          const message = e.message || 'Stencil worker crashed';
          setError(message);
          reject(new Error(message));
        };

        const handleMessage = (e: MessageEvent<WorkerResponse>) => {
          const data = e.data;
          if (!data || data.jobId !== jobId) return;

          if (data.type === 'RENDER_COMPLETE') {
            cleanup();
            setIsRendering(false);
            setLastDurationMs(data.durationMs);
            resolve(new ImageData(new Uint8ClampedArray(data.resultBuffer), data.width, data.height));
          } else if (data.type === 'RENDER_ERROR') {
            cleanup();
            setIsRendering(false);
            setError(data.message);
            reject(new Error(data.message));
          }
        };

        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleWorkerError);

        const req: WorkerRenderRequest = {
          type: 'RENDER_STENCIL_V3',
          jobId,
          imageBuffer: clonedBuffer,
          width: sourceImageData.width,
          height: sourceImageData.height,
          config: options.config ?? HECTOGRAPH_V3_DEFAULT_CONFIG,
        };

        worker.postMessage(req, [clonedBuffer]);
      });
    },
    [getWorker],
  );

  return {
    renderStencilV3,
    isRendering,
    lastDurationMs,
    error,
    presets: STENCIL_V3_PRESETS,
  };
}
