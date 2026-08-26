/**
 * Real homepage before/after examples — verified complete JPEG data URLs.
 * Do not replace with PLACEHOLDER text; that breaks the build.
 */
import babyBefore from "./baby_before";
import babyAfter from "./baby_after";
import elderBefore from "./elder_before";
import elderAfter from "./elder_after";
import poseidonBefore from "./poseidon_before";
import poseidonAfter from "./poseidon_after";
import aztecBefore from "./aztec_before";
import aztecAfter from "./aztec_after";
import hibiscusBefore from "./hibiscus_before";
import hibiscusAfter from "./hibiscus_after";

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
    subtitle: "Dense floral forms converted to clean purple contour + hatch",
    before: hibiscusBefore,
    after: hibiscusAfter,
    beforeLabel: "Original",
    afterLabel: "Stencil",
  },
  {
    id: "elder",
    title: "Elder Portrait",
    subtitle: "Deep facial structure mapped into thermal-ready linework",
    before: elderBefore,
    after: elderAfter,
    beforeLabel: "Photo",
    afterLabel: "Stencil",
  },
  {
    id: "baby",
    title: "Baby Portrait",
    subtitle: "Soft features preserved as confident closed contours",
    before: babyBefore,
    after: babyAfter,
    beforeLabel: "Photo",
    afterLabel: "Stencil",
  },
  {
    id: "aztec",
    title: "Aztec Calendar",
    subtitle: "Intricate ornamental detail kept printable and sharp",
    before: aztecBefore,
    after: aztecAfter,
    beforeLabel: "Reference",
    afterLabel: "Stencil",
  },
  {
    id: "poseidon",
    title: "Poseidon",
    subtitle: "Mythic portrait with full trident detail in purple ink",
    before: poseidonBefore,
    after: poseidonAfter,
    beforeLabel: "Artwork",
    afterLabel: "Stencil",
  },
];

export default TRUE_EXAMPLES[0].before;
