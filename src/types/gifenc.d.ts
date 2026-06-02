declare module "gifenc" {
  export function GIFEncoder(): {
    writeFrame(index: Uint8Array | Uint8ClampedArray, width: number, height: number, opts?: { palette?: number[][]; delay?: number; transparent?: boolean; transparentIndex?: number }): void;
    finish(): void;
    bytes(): Uint8Array;
  };
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: any): number[][];
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: number[][], format?: string): Uint8Array;
}