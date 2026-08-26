/**
 * Homepage before/after examples.
 * Real JPEG files live in /public/examples/ so a bad base64 blob can never
 * break the production build again.
 */
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
    title: "Floral Back Piece",
    subtitle: "Photo converted to hectograph-purple stencil with closed thermal-ready contours",
    before: "/examples/portrait-before.jpg",
    after: "/examples/portrait-after.jpg",
    beforeLabel: "Photo",
    afterLabel: "Stencil",
  },
  {
    id: "floral",
    title: "Botanical Linework",
    subtitle: "Dense floral forms mapped into hatch + contour layers",
    before: "/examples/floral-back-before.jpg",
    after: "/examples/floral-back-after.jpg",
    beforeLabel: "Original",
    afterLabel: "Stencil",
  },
  {
    id: "shoulder",
    title: "Shoulder Study",
    subtitle: "Solid outlines and clean edges for a confident transfer",
    before: "/examples/shoulder-before.jpg",
    after: "/examples/shoulder-after.jpg",
    beforeLabel: "Photo",
    afterLabel: "Stencil",
  },
  {
    id: "detail",
    title: "Ornamental Detail",
    subtitle: "Fine petal structure preserved as printable line + stipple",
    before: "/examples/detail-before.jpg",
    after: "/examples/detail-after.jpg",
    beforeLabel: "Reference",
    afterLabel: "Stencil",
  },
];

export default TRUE_EXAMPLES[0].before;
