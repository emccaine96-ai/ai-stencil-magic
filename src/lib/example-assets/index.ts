/**
 * Homepage before/after examples.
 * All assets are guaranteed-valid data URLs so a bad base64 blob can never
 * break the production build again.
 *
 * When real photos are ready, replace PLACEHOLDER_* with real data URLs or
 * switch these exports to import from /public/examples/*.webp.
 */

/** 1×1 transparent GIF — used only as a last-resort fallback */
export const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** Visible "photo" placeholder (light gray + label) */
export const PLACEHOLDER_BEFORE =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
      <rect width="600" height="800" fill="#f4f4f5"/>
      <rect x="40" y="40" width="520" height="720" rx="24" fill="#e4e4e7" stroke="#d4d4d8" stroke-width="2"/>
      <circle cx="300" cy="300" r="90" fill="#d4d4d8"/>
      <rect x="180" y="430" width="240" height="18" rx="9" fill="#d4d4d8"/>
      <rect x="210" y="470" width="180" height="14" rx="7" fill="#e4e4e7"/>
      <text x="300" y="560" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" fill="#a1a1aa">Sample photo</text>
    </svg>`,
  );

/** Visible "stencil" placeholder (white + purple line art feel) */
export const PLACEHOLDER_AFTER =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
      <rect width="600" height="800" fill="#ffffff"/>
      <circle cx="300" cy="280" r="100" fill="none" stroke="#a855f7" stroke-width="3"/>
      <path d="M210 420 Q300 520 390 420" fill="none" stroke="#a855f7" stroke-width="3"/>
      <path d="M240 300 Q300 360 360 300" fill="none" stroke="#a855f7" stroke-width="2"/>
      <line x1="260" y1="250" x2="280" y2="250" stroke="#a855f7" stroke-width="2"/>
      <line x1="320" y1="250" x2="340" y2="250" stroke="#a855f7" stroke-width="2"/>
      <text x="300" y="600" text-anchor="middle" font-family="system-ui,sans-serif" font-size="22" fill="#a855f7">Sample stencil</text>
    </svg>`,
  );

export type ExamplePair = {
  id: string;
  title: string;
  subtitle: string;
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
};

export const TRUE_EXAMPLES: ExamplePair[] = [
  {
    id: "hibiscus",
    title: "Hibiscus Botanical",
    subtitle: "Line + hatch shading from a detailed drawing",
    before: PLACEHOLDER_BEFORE,
    after: PLACEHOLDER_AFTER,
    beforeLabel: "Original",
    afterLabel: "Stencil",
  },
  {
    id: "elder",
    title: "Portrait — Character Study",
    subtitle: "Complex wrinkles, fabric & jewelry preserved as clean linework",
    before: PLACEHOLDER_BEFORE,
    after: PLACEHOLDER_AFTER,
    beforeLabel: "Photo",
    afterLabel: "Stencil",
  },
  {
    id: "aztec",
    title: "Aztec Calendar",
    subtitle: "Dense ornamental geometry → closed thermal-ready contours",
    before: PLACEHOLDER_BEFORE,
    after: PLACEHOLDER_AFTER,
    beforeLabel: "Reference",
    afterLabel: "Stencil",
  },
  {
    id: "baby",
    title: "Portrait — Child",
    subtitle: "Soft photo tones converted to confident contour + hatch",
    before: PLACEHOLDER_BEFORE,
    after: PLACEHOLDER_AFTER,
    beforeLabel: "Photo",
    afterLabel: "Stencil",
  },
  {
    id: "poseidon",
    title: "Mythic Portrait",
    subtitle: "Hair, beard & metal detail mapped into printable line layers",
    before: PLACEHOLDER_BEFORE,
    after: PLACEHOLDER_AFTER,
    beforeLabel: "Reference",
    afterLabel: "Stencil",
  },
];

// Keep legacy default exports working if anything still imports individual files.
export { PLACEHOLDER_BEFORE as default };
