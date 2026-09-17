import { createFileRoute } from "@tanstack/react-router";
import { RetouchStudio } from "@/components/retouch/RetouchStudio";

export const Route = createFileRoute("/retouch")({
  head: () => ({
    meta: [
      { title: "Retouch Studio — AI Stencil Magic" },
      { name: "description", content: "Post-generation stencil retouch surface: brush, eraser, curves, lighten, darken, and fills on your generated stencil." },
      { property: "og:title", content: "Retouch Studio — AI Stencil Magic" },
      { property: "og:description", content: "Post-generation stencil retouch surface: brush, eraser, curves, lighten, darken, and fills on your generated stencil." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RetouchStudio,
});
