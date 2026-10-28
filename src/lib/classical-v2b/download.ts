import { assertLength, validateSize } from "./fieldops";

export async function maskToPNG(
  mask: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<Blob> {
  validateSize(width, height);
  assertLength(mask, width * height, "Export mask");

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Unable to create export canvas");
  }

  const image = context.createImageData(width, height);

  for (let p = 0; p < mask.length; p++) {
    const index = p * 4;
    const value = mask[p] >= 128 ? 0 : 255;

    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
    image.data[index + 3] = 255;
  }

  context.putImageData(image, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob
        ? resolve(blob)
        : reject(new Error("PNG encoding failed")),
      "image/png",
    );
  });
}

export function downloadBlob(
  blob: Blob,
  filename: string,
): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
