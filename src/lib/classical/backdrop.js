/**
 * Dark-backdrop detection (shared by stipple.js and the Standard hatch layer).
 *
 * Problem: the engines map tone to ink as "darker = more ink". On a photo with a
 * near-black backdrop (studio animal/portrait shots) the backdrop is the darkest
 * tone in the frame, so it got the densest dots and hatching, flooding ~2/3 of the
 * stencil. A black backdrop carries no subject information and should stay paper.
 *
 * Detection is deliberately conservative so light-background art (the normal case)
 * is never affected: a backdrop is reported only when the histogram's dominant
 * (smoothed) peak is dark (< 110), the band around it is narrow (<= 90 levels), and
 * it covers >= 30% of the frame. Anything else returns null = behave exactly as before.
 */
export function detectDarkBackdrop(data) {
  const hist = new Float64Array(256);
  for (let i = 0; i < data.length; i += 4) hist[data[i]]++;
  const total = data.length / 4;
  if (!total) return null;

  const sm = new Float64Array(256);
  for (let v = 0; v < 256; v++) {
    let a = 0, k = 0;
    for (let o = -6; o <= 6; o++) {
      const u = v + o;
      if (u >= 0 && u < 256) { a += hist[u]; k++; }
    }
    sm[v] = a / k;
  }
  let mode = 0;
  for (let v = 1; v < 256; v++) if (sm[v] > sm[mode]) mode = v;

  let lo = mode, hi = mode;
  while (lo > 0 && sm[lo - 1] >= 0.25 * sm[mode]) lo--;
  while (hi < 255 && sm[hi + 1] >= 0.25 * sm[mode]) hi++;
  let bg = 0;
  for (let v = lo; v <= hi; v++) bg += hist[v];

  if (!(mode < 110 && hi - lo <= 90 && bg / total >= 0.30)) return null;

  // Subject white point: 95th percentile of the tones above the backdrop band.
  let above = 0;
  for (let v = hi + 1; v < 256; v++) above += hist[v];
  let subjectWhite = 255;
  if (above > 0) {
    let c = 0;
    for (let v = hi + 1; v < 256; v++) {
      c += hist[v];
      if (c >= 0.95 * above) { subjectWhite = v; break; }
    }
  }
  if (subjectWhite - hi < 24) subjectWhite = Math.min(255, hi + 24);
  return { lo, hi, subjectWhite };
}

/**
 * Darkness (0..1) that drives ink density for a pixel of luminance `lum`.
 * No backdrop: the original `1 - lum/255`. Backdrop: backdrop tones fade to 0 and the
 * subject's own tone range is stretched onto the full 0..1 scale.
 */
export function inkDarkness(lum, backdrop, margin = 20) {
  if (!backdrop) return 1 - lum / 255;
  const t = Math.max(0, Math.min(1, (lum - backdrop.hi) / Math.max(1, backdrop.subjectWhite - backdrop.hi)));
  const fade = Math.max(0, Math.min(1, (lum - backdrop.lo) / Math.max(1, backdrop.hi + margin - backdrop.lo)));
  return (1 - t) * fade;
}
