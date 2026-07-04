import React, { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  runFullPipeline,
  type PipelineParams,
  type ColorKey,
} from "@/lib/pro-stencil-engine";

const DPI_OPTIONS = [72, 150, 300, 600] as const;
const PRESETS: ColorKey[] = ["purple", "deepPurple", "violet", "black", "blue"];

interface ProStencilPanelProps {
  sourceCanvas?: HTMLCanvasElement | null;
  onStencilReady?: (canvas: HTMLCanvasElement) => void;
}

export function ProStencilPanel({ sourceCanvas, onStencilReady }: ProStencilPanelProps) {
  const [colorKey, setColorKey] = useState<ColorKey>("purple");
  const [style, setStyle] = useState<"edge" | "tonal">("edge");
  const [useML, setUseML] = useState(true);
  const [selectedDPI, setSelectedDPI] = useState<number>(300);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultCanvas, setResultCanvas] = useState<HTMLCanvasElement | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const handleGenerate = useCallback(async () => {
    if (!sourceCanvas) {
      toast.error("Please upload or select a source image.");
      return;
    }
    setIsProcessing(true);
    try {
      const ctx = sourceCanvas.getContext("2d");
      if (!ctx) throw new Error("Unable to get context from source canvas");
      const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);

      const params: PipelineParams = {
        data: imageData,
        colorKey,
        style,
        useML,
        blurIterations: 1,
        sigma: 1.0,
        lowThreshold: 40,
        highThreshold: 120,
        toneStrength: 1.2,
        stippleDensity: 0.5,
        hatchAngle: 45,
        useErrorDiff: true,
        tolerance: 30,
        blockSize: 11,
        C: 8,
        smooth: true,
      };

      const outputImageData = await runFullPipeline(params);
      const outCanvas = document.createElement("canvas");
      outCanvas.width = outputImageData.width;
      outCanvas.height = outputImageData.height;
      outCanvas.getContext("2d")!.putImageData(outputImageData, 0, 0);

      setResultCanvas(outCanvas);
      if (previewRef.current) {
        previewRef.current.width = outCanvas.width;
        previewRef.current.height = outCanvas.height;
        previewRef.current.getContext("2d")!.drawImage(outCanvas, 0, 0);
      }
      onStencilReady?.(outCanvas);
      toast.success("Stencil generated!");
    } catch (err) {
      console.error(err);
      toast.error("Failed to generate stencil.");
    } finally {
      setIsProcessing(false);
    }
  }, [sourceCanvas, colorKey, style, useML, onStencilReady]);

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-3">
      <h2 className="text-lg font-semibold">Pro Stencil Generator</h2>

      <label className="block text-sm">
        Style:{" "}
        <select
          className="ml-2 bg-background border border-border rounded px-2 py-1"
          value={style}
          onChange={(e) => setStyle(e.target.value as "edge" | "tonal")}
        >
          <option value="edge">Edge</option>
          <option value="tonal">Tonal</option>
        </select>
      </label>

      <label className="block text-sm">
        Color Key:{" "}
        <select
          className="ml-2 bg-background border border-border rounded px-2 py-1"
          value={colorKey}
          onChange={(e) => setColorKey(e.target.value as ColorKey)}
        >
          {PRESETS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        <input
          type="checkbox"
          className="mr-2"
          checked={useML}
          onChange={(e) => setUseML(e.target.checked)}
        />
        Use ML Refinement
      </label>

      <label className="block text-sm">
        Output DPI:{" "}
        <select
          className="ml-2 bg-background border border-border rounded px-2 py-1"
          value={selectedDPI}
          onChange={(e) => setSelectedDPI(parseInt(e.target.value, 10))}
        >
          {DPI_OPTIONS.map((dpi) => (
            <option key={dpi} value={dpi}>{dpi}</option>
          ))}
        </select>
      </label>

      <button
        onClick={handleGenerate}
        disabled={isProcessing}
        className="px-4 py-2 bg-primary text-primary-foreground rounded disabled:opacity-50"
      >
        {isProcessing ? "Generating…" : "Generate Stencil"}
      </button>

      <div>
        <canvas ref={previewRef} className="border border-border max-w-full" />
      </div>

      {resultCanvas && (
        <button
          className="px-4 py-2 border border-border rounded"
          onClick={() => {
            const a = document.createElement("a");
            a.href = resultCanvas.toDataURL("image/png");
            a.download = `stencil-${selectedDPI}dpi.png`;
            a.click();
            toast.success("PNG exported!");
          }}
        >
          Export as PNG
        </button>
      )}
    </div>
  );
}