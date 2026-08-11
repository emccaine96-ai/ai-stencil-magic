import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listDocuments from "./tools/list-documents";
import getDocument from "./tools/get-document";
import renameDocument from "./tools/rename-document";
import listGallery from "./tools/list-gallery";
import stencilPresets from "./tools/stencil-presets";

const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "ai-stencil-magic",
  title: "AI Stencil Magic",
  version: "0.1.0",
  instructions:
    "Tools for AI Stencil Magic, a tattoo stencil studio. Use list_documents / get_document to inspect the signed-in artist's synced stencil documents, rename_document to rename one, list_gallery_posts to browse published community stencils, and get_stencil_presets to recommend stencil engine settings for a style.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listDocuments, getDocument, renameDocument, listGallery, stencilPresets],
});
