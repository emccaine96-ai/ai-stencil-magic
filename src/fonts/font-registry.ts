/**
 * Font Squirrel Integration — Tattoo Lettering Font Registry.
 *
 * Extends the existing Google Fonts picker with self-hosted,
 * commercial-use-cleared fonts from Font Squirrel (fontsquirrel.com).
 * Tattoo-relevant styles: blackletter, gothic, script, brush, monoline, fine line.
 *
 * Font files are binary — they go into public/fonts/<family>/ via git push,
 * not through the AI chat. The registry entries below are the wiring.
 */

export type FontSource = 'google-fonts' | 'self-hosted';
export type FontLicense = 'ofl' | 'apache-2.0' | 'free-commercial' | 'demo-restricted';

export type TattooFontStyle =
  | 'blackletter' | 'script' | 'fineline' | 'traditional-bold'
  | 'serif' | 'sans' | 'display';

export interface TattooFont {
  id: string;
  family: string;
  source: FontSource;
  style: TattooFontStyle;
  license: FontLicense;
  licenseUrl: string;
  weight: number[];
  fileUrls?: {
    woff2: string;
    woff?: string;
    outline?: string; // .ttf/.otf path — needed for text-to-stencil vector outlines
  };
}

/**
 * Font registry — the existing 100 Google Fonts entries stay as-is
 * in the existing font picker. New Font Squirrel entries go here.
 *
 * To add a new font:
 * 1. Download from fontsquirrel.com (filter: license = "100% Free" or "Free for Commercial Use")
 * 2. Run through Font Squirrel's @font-face Webfont Generator
 * 3. Upload WOFF2/WOFF + original TTF/OTF to public/fonts/<family>/
 * 4. Add an entry below with the correct file paths and license URL
 */
export const FONT_REGISTRY: TattooFont[] = [
  // --- Placeholder entries — replace with actual Font Squirrel fonts ---
  // To activate: download the font, upload to public/fonts/, uncomment and edit:
  //
  // {
  //   id: 'pirata-one',
  //   family: 'Pirata One',
  //   source: 'google-fonts',
  //   style: 'blackletter',
  //   license: 'ofl',
  //   licenseUrl: 'https://fonts.google.com/specimen/Pirata+One',
  //   weight: [400],
  // },
  // {
  //   id: 'unifraktur-maguntia',
  //   family: 'UnifrakturMaguntia',
  //   source: 'google-fonts',
  //   style: 'blackletter',
  //   license: 'ofl',
  //   licenseUrl: 'https://fonts.google.com/specimen/UnifrakturMaguntia',
  //   weight: [400],
  // },
  // --- Font Squirrel self-hosted examples (uncomment after uploading files) ---
  // {
  //   id: 'blackletter-pro',
  //   family: 'Blackletter Pro',
  //   source: 'self-hosted',
  //   style: 'blackletter',
  //   license: 'free-commercial',
  //   licenseUrl: 'https://www.fontsquirrel.com/license/blackletter-pro',
  //   weight: [400],
  //   fileUrls: {
  //     woff2: '/fonts/blackletter-pro/blackletter-pro.woff2',
  //     woff: '/fonts/blackletter-pro/blackletter-pro.woff',
  //     outline: '/fonts/blackletter-pro/blackletter-pro.otf',
  //   },
  // },
];

/** Get fonts filtered by style. */
export function getFontsByStyle(style: TattooFontStyle): TattooFont[] {
  return FONT_REGISTRY.filter(f => f.style === style);
}

/** Get all self-hosted fonts. */
export function getSelfHostedFonts(): TattooFont[] {
  return FONT_REGISTRY.filter(f => f.source === 'self-hosted' && f.fileUrls);
}

/** Get all blackletter/gothic fonts (most tattoo-relevant). */
export function getBlackletterFonts(): TattooFont[] {
  return FONT_REGISTRY.filter(f => f.style === 'blackletter' || f.style === 'script');
}
