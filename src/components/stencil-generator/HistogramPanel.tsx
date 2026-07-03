import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  computeHistogram,
  computeCDF,
  applyToneCurve,
  type StencilOptions,
} from "@/lib/stencil-engine";

interface HistogramPanelProps {
  sourceCanvas?: HTMLCanvasElement | null;
  onToneCurveApplied?: (canvas: HTMLCanvasElement) => void;
  options?: StencilOptions;
}

export function HistogramPanel({
  sourceCanvas,
  onToneCurveApplied,
  options,
}: HistogramPanelProps) {
  // Compute histogram for the source image
  const histogram = useMemo(() => {
    if (!sourceCanvas) return null;
    const ctx = sourceCanvas.getContext("2d");
    if (!ctx) return null;
    const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    return computeHistogram(imageData);
  }, [sourceCanvas]);

  // Compute CDF (tone curve from histogram equalization)
  const cdf = useMemo(() => {
    if (!histogram) return null;
    return computeCDF(histogram);
  }, [histogram]);

  // Find min/max brightness in histogram
  const { minBrightness, maxBrightness, avgBrightness } = useMemo(() => {
    if (!histogram) return { minBrightness: 0, maxBrightness: 0, avgBrightness: 0 };
    let min = 255, max = 0, sum = 0, count = 0;
    for (let i = 0; i < 256; i++) {
      if (histogram[i] > 0) {
        min = Math.min(min, i);
        max = Math.max(max, i);
        sum += i * histogram[i];
        count += histogram[i];
      }
    }
    const avg = count > 0 ? sum / count : 128;
    return { minBrightness: min, maxBrightness: max, avgBrightness: Math.round(avg) };
  }, [histogram]);

  // Normalize histogram for display (max height = 100px)
  const normalizedHistogram = useMemo(() => {
    if (!histogram) return null;
    const maxVal = Math.max(...histogram);
    return histogram.map((v) => (v / maxVal) * 100);
  }, [histogram]);

  // Apply histogram equalization (tone curve)
  const applyEqualization = () => {
    if (!sourceCanvas || !cdf) return;
    const ctx = sourceCanvas.getContext("2d");
    if (!ctx) return;
    const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const equalized = applyToneCurve(imageData, cdf);
    const outputCanvas = document.createElement("canvas");
    outputCanvas.width = sourceCanvas.width;
    outputCanvas.height = sourceCanvas.height;
    const outCtx = outputCanvas.getContext("2d")!;
    outCtx.putImageData(equalized, 0, 0);
    onToneCurveApplied?.(outputCanvas);
  };

  if (!histogram || !normalizedHistogram) {
    return (
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">
          Upload an image to see histogram
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Tone Distribution</h3>
        <Badge variant="outline" className="text-xs">
          {minBrightness}–{maxBrightness}
        </Badge>
      </div>

      {/* Histogram display */}
      <div className="flex items-end gap-px h-24 bg-muted rounded p-2">
        {normalizedHistogram.map((h, i) => (
          <div
            key={i}
            className="flex-1 bg-foreground rounded-t opacity-70 hover:opacity-100 transition-opacity"
            style={{
              height: `${h}%`,
              minHeight: h > 0 ? "2px" : "0px",
            }}
            title={`Bin ${i}: ${histogram[i]} pixels`}
          />
        ))}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="bg-muted p-2 rounded">
          <p className="text-muted-foreground">Min</p>
          <p className="font-mono font-semibold">{minBrightness}</p>
        </div>
        <div className="bg-muted p-2 rounded">
          <p className="text-muted-foreground">Avg</p>
          <p className="font-mono font-semibold">{avgBrightness}</p>
        </div>
        <div className="bg-muted p-2 rounded">
          <p className="text-muted-foreground">Max</p>
          <p className="font-mono font-semibold">{maxBrightness}</p>
        </div>
      </div>

      {/* Tone curve visualization */}
      {cdf && (
        <div className="space-y-2">
          <p className="text-xs font-medium">Equalized Curve</p>
          <svg width="100%" height="60" className="bg-muted rounded">
            <polyline
              points={cdf
                .map(
                  (v, i) =>
                    `${(i / 255) * 100}%,${100 - (v / 255) * 100}%`
                )
                .join(" ")}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              className="text-foreground opacity-60"
            />
            <line
              x1="0%"
              y1="100%"
              x2="100%"
              y2="0%"
              stroke="currentColor"
              strokeWidth="0.5"
              vectorEffect="non-scaling-stroke"
              className="text-muted-foreground opacity-30"
              strokeDasharray="4,2"
            />
          </svg>
        </div>
      )}

      {/* Action button */}
      <button
        onClick={applyEqualization}
        className="w-full px-3 py-2 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 transition-colors"
      >
        📊 Auto-Equalize
      </button>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Stretches underexposed or overexposed images to maximize contrast before edge detection.
      </p>
    </Card>
  );
}
