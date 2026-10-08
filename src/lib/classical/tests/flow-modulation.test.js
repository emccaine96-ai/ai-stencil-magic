import { computeStructureTensor, applyFlowModulation } from '../structure-tensor.js';

export function runAllTests() {
  try {
    const img = new ImageData(64, 64);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = x === y ? 0 : 255;
      img.data[i + 3] = 255;
    }
    const result = applyFlowModulation(img, computeStructureTensor(img), 0.65);
    const count = (image) => {
      let ink = 0;
      for (let i = 0; i < image.data.length; i += 4) if (image.data[i] < 128) ink++;
      return ink;
    };
    // Reproduced at strength 0.65: input 64, old gradient sampling 68,
    // corrected tangent sampling 64. Center RGB: input 0, old 72, corrected 0.
    if (count(img) !== 64 || count(result) !== 64) throw new Error('Diagonal ink count changed');
    if (result.data[(32 * 64 + 32) * 4] !== 0) throw new Error('Black line averaged across white');
    if (applyFlowModulation(img, computeStructureTensor(img), 0) !== img) throw new Error('Zero strength changed');
    return { passed: 1, failed: 0, failures: [] };
  } catch (error) {
    return { passed: 0, failed: 1, failures: [error.message] };
  }
}