// Shim — kept for backwards compatibility with the (untouched) stencil
// generation page. All real persistence now lives in src/lib/localDB.ts.
//
// The autosave call from /create flows through `saveStencil` here and is
// re-routed into the new DMS as a fresh Document with a single base layer.

import { createDocument, makeThumbnail, type DocumentData } from "./localDB";

export type VaultEntry = {
  id: string;
  createdAt: number;
  thumb: string;
  stencil: string;
  photo: string | null;
  style: string;
  meta?: Record<string, unknown>;
};

export async function saveStencil(input: {
  stencil: string;
  photo: string | null;
  style: string;
  meta?: Record<string, unknown>;
}): Promise<DocumentData | void> {
  if (typeof window === "undefined") return;
  const thumb = await makeThumbnail(input.stencil);
  return createDocument({
    name: `${input.style[0]?.toUpperCase()}${input.style.slice(1)} stencil`,
    tags: [input.style],
    thumbnail: thumb,
    originalAIImage: input.stencil,
    style: input.style,
    layeredEditorData: null,
  });
}