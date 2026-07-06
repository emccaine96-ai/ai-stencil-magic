import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listGalleryPosts from "./tools/list-gallery-posts";
import getGalleryPost from "./tools/get-gallery-post";
import myGalleryPosts from "./tools/my-gallery-posts";
import deleteGalleryPost from "./tools/delete-gallery-post";

// The OAuth issuer must be the direct Supabase host — the published proxy URL
// is rejected by mcp-js due to RFC 8414 issuer mismatch. Use VITE_SUPABASE_PROJECT_ID
// which Vite inlines as a literal at build time.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "primal-print-ai-mcp",
  title: "Primal Print AI",
  version: "0.1.0",
  instructions:
    "Tools for browsing the public Primal Print AI tattoo/stencil gallery and, when authenticated, managing your own gallery posts. Use `list_gallery_posts` and `get_gallery_post` for public browsing; use `my_gallery_posts` and `delete_gallery_post` when acting as the signed-in user.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listGalleryPosts, getGalleryPost, myGalleryPosts, deleteGalleryPost],
});