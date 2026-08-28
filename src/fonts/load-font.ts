/**
 * Font Squirrel Integration — Self-hosted font loading.
 *
 * Injects @font-face rules for self-hosted fonts and lazy-loads
 * them via the CSS Font Loading API. Same pattern as the existing
 * Google Fonts picker.
 */

import type { TattooFont } from './font-registry';
import { getSelfHostedFonts } from './font-registry';

let injected = false;

/** Injects @font-face rules for all self-hosted fonts once. */
export function injectSelfHostedFontFaces(fonts?: TattooFont[]) {
  if (injected) return;
  const selfHosted = (fonts ?? getSelfHostedFonts()).filter(f => f.source === 'self-hosted' && f.fileUrls);
  if (selfHosted.length === 0) return;

  const css = selfHosted.map(f => `
    @font-face {
      font-family: '${f.family}';
      src: url('${f.fileUrls!.woff2}') format('woff2')${f.fileUrls!.woff ? `, url('${f.fileUrls!.woff}') format('woff')` : ''};
      font-display: swap;
    }
  `).join('\n');

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  injected = true;
}

/** Same lazy-load pattern as the existing Google Fonts picker (CSS Font Loading API). */
export async function ensureFontLoaded(font: TattooFont): Promise<void> {
  const face = `1em '${font.family}'`;
  if (document.fonts.check(face)) return;

  if (font.source === 'self-hosted') {
    injectSelfHostedFontFaces([font]);
  }

  await document.fonts.load(face);
}

/** Preload all self-hosted fonts at once. */
export async function preloadAllSelfHostedFonts(): Promise<void> {
  const fonts = getSelfHostedFonts();
  injectSelfHostedFontFaces(fonts);
  await Promise.all(fonts.map(f => ensureFontLoaded(f)));
}
