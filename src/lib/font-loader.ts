// On-demand web font loader for the Vault text tool.
import type { TattooFont } from "@/lib/tattoo-fonts";

const injectedLinks = new Set<string>();

function ensureGoogleFontLink(family: string): void {
  if (injectedLinks.has(family) || typeof document === "undefined") return;
  const urlFamily = family.trim().replace(/\s+/g, "+");
  const href = `https://fonts.googleapis.com/css2?family=${urlFamily}:wght@400;700&display=swap`;
  if (document.head.querySelector(`link[data-tattoo-font="${family}"]`)) {
    injectedLinks.add(family);
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.tattooFont = family;
  document.head.appendChild(link);
  injectedLinks.add(family);
}

/** Ensures a font is downloaded and parsed enough to render on canvas. */
export async function ensureFontLoaded(font: TattooFont, size = 72): Promise<void> {
  if (font.source === "system" || typeof document === "undefined") return;
  ensureGoogleFontLink(font.family);
  if (!("fonts" in document)) return;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`400 ${size}px "${font.family}"`),
        document.fonts.load(`700 ${size}px "${font.family}"`),
      ]),
      new Promise((resolve) => setTimeout(resolve, 2500)),
    ]);
  } catch {
    // Fall back silently to the default font.
  }
}

/** CSS font-family stack for ctx.font / drawText. */
export function cssFontFamily(font: TattooFont): string {
  return font.source === "system"
    ? `${font.family}, Arial, sans-serif`
    : `"${font.family}", system-ui, sans-serif`;
}