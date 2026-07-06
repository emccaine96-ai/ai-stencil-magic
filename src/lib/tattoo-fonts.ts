// Curated font catalog for the Vault text tool — 100 fonts picked for
// tattoo lettering, grouped the way an artist actually thinks about styles.

export type FontSource = "google" | "system";

export interface TattooFont {
  name: string;
  family: string;
  source: FontSource;
  category: string;
}

const google = (name: string, category: string, family = name): TattooFont => ({
  name, family, category, source: "google",
});
const system = (name: string, category: string, family = name): TattooFont => ({
  name, family, category, source: "system",
});

export const TATTOO_FONTS: TattooFont[] = [
  // Old English / Blackletter
  google("UnifrakturMaguntia", "Old English & Blackletter"),
  google("UnifrakturCook", "Old English & Blackletter"),
  google("Pirata One", "Old English & Blackletter"),
  google("MedievalSharp", "Old English & Blackletter"),
  google("Eagle Lake", "Old English & Blackletter"),
  google("IM Fell English", "Old English & Blackletter"),
  google("IM Fell English SC", "Old English & Blackletter"),
  google("Almendra", "Old English & Blackletter"),
  google("Almendra SC", "Old English & Blackletter"),
  google("Cinzel Decorative", "Old English & Blackletter"),
  // Chicano fine-line script
  google("Herr Von Muellerhoff", "Chicano Script"),
  google("Mr De Haviland", "Chicano Script"),
  google("Monsieur La Doulaise", "Chicano Script"),
  google("Pinyon Script", "Chicano Script"),
  google("Rouge Script", "Chicano Script"),
  google("WindSong", "Chicano Script"),
  google("Bilbo", "Chicano Script"),
  google("Bilbo Swash Caps", "Chicano Script"),
  // Calligraphy & Script
  google("Great Vibes", "Calligraphy & Script"),
  google("Alex Brush", "Calligraphy & Script"),
  google("Sacramento", "Calligraphy & Script"),
  google("Tangerine", "Calligraphy & Script"),
  google("Allura", "Calligraphy & Script"),
  google("Parisienne", "Calligraphy & Script"),
  google("Playball", "Calligraphy & Script"),
  google("Satisfy", "Calligraphy & Script"),
  google("Dancing Script", "Calligraphy & Script"),
  google("Kristi", "Calligraphy & Script"),
  google("Mrs Saint Delafield", "Calligraphy & Script"),
  google("Yellowtail", "Calligraphy & Script"),
  google("Cookie", "Calligraphy & Script"),
  google("Marck Script", "Calligraphy & Script"),
  google("Meddon", "Calligraphy & Script"),
  google("Miss Fajardose", "Calligraphy & Script"),
  google("Niconne", "Calligraphy & Script"),
  google("Petit Formal Script", "Calligraphy & Script"),
  google("Qwigley", "Calligraphy & Script"),
  google("Italianno", "Calligraphy & Script"),
  // Traditional Tattoo / Bold Display
  google("Bebas Neue", "Traditional & Bold Display"),
  google("Anton", "Traditional & Bold Display"),
  google("Bangers", "Traditional & Bold Display"),
  google("Oswald", "Traditional & Bold Display"),
  google("Archivo Black", "Traditional & Bold Display"),
  google("Righteous", "Traditional & Bold Display"),
  google("Alfa Slab One", "Traditional & Bold Display"),
  google("Luckiest Guy", "Traditional & Bold Display"),
  google("Titan One", "Traditional & Bold Display"),
  google("Passion One", "Traditional & Bold Display"),
  google("Fjalla One", "Traditional & Bold Display"),
  google("Staatliches", "Traditional & Bold Display"),
  google("Teko", "Traditional & Bold Display"),
  google("Big Shoulders Display", "Traditional & Bold Display"),
  google("Racing Sans One", "Traditional & Bold Display"),
  // Graffiti & Street
  google("Permanent Marker", "Graffiti & Street"),
  google("Rock Salt", "Graffiti & Street"),
  google("Special Elite", "Graffiti & Street"),
  google("Bungee", "Graffiti & Street"),
  google("Bungee Shade", "Graffiti & Street"),
  google("Bungee Inline", "Graffiti & Street"),
  google("Frijole", "Graffiti & Street"),
  google("Bagel Fat One", "Graffiti & Street"),
  google("Boogaloo", "Graffiti & Street"),
  google("Fascinate", "Graffiti & Street"),
  // Horror & Grunge
  google("Creepster", "Horror & Grunge"),
  google("Nosifer", "Horror & Grunge"),
  google("Butcherman", "Horror & Grunge"),
  google("Eater", "Horror & Grunge"),
  google("Griffy", "Horror & Grunge"),
  google("Trade Winds", "Horror & Grunge"),
  google("Vampiro One", "Horror & Grunge"),
  google("Rubik Glitch", "Horror & Grunge"),
  google("Metal Mania", "Horror & Grunge"),
  google("Grenze Gotisch", "Horror & Grunge"),
  // Stencil, Military & Techno
  google("Black Ops One", "Stencil, Military & Techno"),
  google("Stardos Stencil", "Stencil, Military & Techno"),
  google("Rajdhani", "Stencil, Military & Techno"),
  google("Wallpoet", "Stencil, Military & Techno"),
  google("Audiowide", "Stencil, Military & Techno"),
  google("Michroma", "Stencil, Military & Techno"),
  google("Aldrich", "Stencil, Military & Techno"),
  google("Orbitron", "Stencil, Military & Techno"),
  // Classic Serif & Roman
  google("Playfair Display", "Classic Serif & Roman"),
  google("Cinzel", "Classic Serif & Roman"),
  google("Cormorant Garamond", "Classic Serif & Roman"),
  google("EB Garamond", "Classic Serif & Roman"),
  google("Libre Baskerville", "Classic Serif & Roman"),
  google("Merriweather", "Classic Serif & Roman"),
  google("PT Serif", "Classic Serif & Roman"),
  google("Marcellus", "Classic Serif & Roman"),
  google("Spectral", "Classic Serif & Roman"),
  google("Crimson Text", "Classic Serif & Roman"),
  // Clean Sans & System
  google("Roboto", "Clean Sans & System"),
  google("Open Sans", "Clean Sans & System"),
  google("Montserrat", "Clean Sans & System"),
  google("Poppins", "Clean Sans & System"),
  google("Inter", "Clean Sans & System"),
  google("Lato", "Clean Sans & System"),
  system("Arial", "Clean Sans & System"),
  system("Helvetica", "Clean Sans & System"),
  system("Impact", "Clean Sans & System"),
];

if (import.meta.env?.DEV && TATTOO_FONTS.length !== 100) {
  console.warn(`[tattoo-fonts] expected 100 fonts, found ${TATTOO_FONTS.length}`);
}

export const TATTOO_FONTS_BY_CATEGORY: { category: string; fonts: TattooFont[] }[] = (() => {
  const order: string[] = [];
  const map = new Map<string, TattooFont[]>();
  for (const font of TATTOO_FONTS) {
    if (!map.has(font.category)) { map.set(font.category, []); order.push(font.category); }
    map.get(font.category)!.push(font);
  }
  return order.map((category) => ({ category, fonts: map.get(category)! }));
})();