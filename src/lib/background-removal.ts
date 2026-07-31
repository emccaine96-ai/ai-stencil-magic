// Background removal — tries the @imgly/background-removal AI segmenter
// first (if installed), falls back to a corner-sampled chroma-key. Accepts
// either an <img> or a <canvas> so the studio and stencil panel can share
// the same helper.

export async function removeBackground(
  imageElement: HTMLImageElement | HTMLCanvasElement,
): Promise<HTMLCanvasElement> {
  const w = "naturalWidth" in imageElement ? imageElement.naturalWidth : imageElement.width;
  const h = "naturalHeight" in imageElement ? imageElement.naturalHeight : imageElement.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(imageElement as CanvasImageSource, 0, 0);

  // Attempt to use @imgly/background-removal if installed at runtime.
  try {
    const modName = "@imgly/background-removal";
    const mod = await import(/* @vite-ignore */ modName);
    const removeBg = (mod as { removeBackground: (b: Blob) => Promise<Blob> }).removeBackground;
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Canvas to blob failed"))),
        "image/png",
      );
    });
    const resultBlob = await removeBg(blob);
    const url = URL.createObjectURL(resultBlob);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Load failed"));
      img.src = url;
    });
    const resultCanvas = document.createElement("canvas");
    resultCanvas.width = img.naturalWidth;
    resultCanvas.height = img.naturalHeight;
    resultCanvas.getContext("2d")!.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
    return resultCanvas;
  } catch {
    // Fallback: chroma-key on the top-left corner pixel.
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const bgR = data[0],
      bgG = data[1],
      bgB = data[2];
    const tolerance = 30;
    for (let i = 0; i < data.length; i += 4) {
      if (
        Math.abs(data[i] - bgR) < tolerance &&
        Math.abs(data[i + 1] - bgG) < tolerance &&
        Math.abs(data[i + 2] - bgB) < tolerance
      ) {
        data[i + 3] = 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
}
