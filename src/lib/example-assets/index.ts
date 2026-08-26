/**
 * Homepage before/after examples.
 * Uses real photos already shipped in src/assets/.
 * "After" uses the same source photo; the homepage applies a stencil CSS filter.
 */

import sample1 from "@/assets/sample-1.jpg";
import sample2 from "@/assets/sample-2.jpg";
import sample3 from "@/assets/sample-3.jpg";
import samplePortrait from "@/assets/sample-portrait.jpg";

/** Fallback 1×1 transparent GIF */
export const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

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
    id: "portrait",
    title: "Portrait Study",
    subtitle: "Soft photo tones converted to confident contour + hatch",
    before: samplePortrait,
    after: samplePortrait,
    beforeLabel: "Photo",
    afterLabel: "Stencil",
  },
  {
    id: "sample1",
    title: "Reference Study",
    subtitle: "Clean edges and tonal structure for thermal transfer",
    before: sample1,
    after: sample1,
    beforeLabel: "Original",
    afterLabel: "Stencil",
  },
  {
    id: "sample2",
    title: "Character Detail",
    subtitle: "Fabric, hair and facial structure mapped into line layers",
    before: sample2,
    after: sample2,
    beforeLabel: "Photo",
    afterLabel: "Stencil",
  },
  {
    id: "sample3",
    title: "Bold Form",
    subtitle: "Strong contrast subjects convert cleanly to printable contours",
    before: sample3,
    after: sample3,
    beforeLabel: "Reference",
    afterLabel: "Stencil",
  },
];

// Legacy named placeholders (kept so old imports do not crash)
export const PLACEHOLDER_BEFORE = samplePortrait;
export const PLACEHOLDER_AFTER = samplePortrait;
export default samplePortrait;
