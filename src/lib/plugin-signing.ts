/**
 * Phase 6 Wave 4 — Marketplace-grade plugin signature verification using
 * the browser SubtleCrypto WebCrypto API (Ed25519 / ECDSA P-256). Plugin
 * authors sign the manifest+code SHA-256 with their private key; we ship
 * trusted publisher public keys and reject unsigned/tampered plugins.
 */

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  author: string;
  permissions: ("layers" | "filters" | "export" | "network")[];
  entrypoint: string; // JS string
};

export type SignedPlugin = {
  manifest: PluginManifest;
  signature: string;   // base64
  publisherKeyId: string;
};

const TRUSTED_KEYS: Record<string, string> = {
  // Demo Ed25519 / ECDSA public keys (base64 SPKI). Replace in production.
  "primal-official": "",
};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importEcdsaKey(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "spki", b64ToBytes(b64) as BufferSource,
    { name: "ECDSA", namedCurve: "P-256" },
    false, ["verify"]
  );
}

export async function pluginDigest(m: PluginManifest): Promise<Uint8Array> {
  const canonical = JSON.stringify({
    id: m.id, name: m.name, version: m.version, author: m.author,
    permissions: m.permissions.slice().sort(), entrypoint: m.entrypoint,
  });
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)));
}

export async function verifyPlugin(p: SignedPlugin): Promise<{ valid: boolean; reason?: string }> {
  const pubB64 = TRUSTED_KEYS[p.publisherKeyId];
  if (!pubB64) return { valid: false, reason: "Untrusted publisher" };
  try {
    const key = await importEcdsaKey(pubB64);
    const digest = await pluginDigest(p.manifest);
    const sig = b64ToBytes(p.signature);
    const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig as BufferSource, digest as BufferSource);
    return ok ? { valid: true } : { valid: false, reason: "Signature mismatch" };
  } catch (e) {
    return { valid: false, reason: String(e) };
  }
}

/** Add or replace a trusted publisher key (e.g. user-imported). */
export function trustPublisher(id: string, spkiBase64: string) {
  TRUSTED_KEYS[id] = spkiBase64;
}
