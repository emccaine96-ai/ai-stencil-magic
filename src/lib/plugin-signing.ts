/**
 * Phase 6 Wave 4 — Marketplace-grade plugin signature verification using
 * the browser / Node SubtleCrypto API (ECDSA P-256 / SHA-256). Plugin
 * authors sign the manifest+code digest with their private key; we ship
 * trusted publisher public keys and reject unsigned, tampered, expired,
 * or revoked plugins.
 */

export type PluginPermissions = "layers" | "filters" | "export" | "network";

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  author?: string;
  kind?: string;
  description?: string;
  permissions?: PluginPermissions[];
  entrypoint?: string;
  code?: string;
  params?: any[];
  /** Signed expiry (ms epoch). Lives in the manifest so an attacker cannot strip or extend it. */
  expiresAt?: number;
};

export type SignedPlugin = {
  manifest: PluginManifest;
  signature: string; // base64 IEEE-P1363 (64 bytes)
  publisherKeyId: string;
  expiresAt?: number;
  revoked?: boolean;
};

export type VerificationStatus =
  | "verified"
  | "unsigned"
  | "untrusted_publisher"
  | "tampered"
  | "expired"
  | "revoked"
  | "malformed";

export type PluginVerificationResult = {
  valid: boolean;
  status: VerificationStatus;
  reason?: string;
};

/** Known revoked key IDs or plugin signatures */
export const REVOKED_KEY_IDS = new Set<string>();

/** In-memory cache of verified CryptoKey objects */
const TRUSTED_KEYS: Record<string, CryptoKey> = {};
/** Raw trusted key representations for persistence */
const TRUSTED_KEY_RAW: Record<string, string | JsonWebKey> = {};

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Constant-time byte array comparison */
export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Produce canonical JSON string with sorted keys recursively at all levels.
 */
export function canonicalJson(obj: any): string {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(canonicalJson).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return "{" + parts.join(",") + "}";
}

/**
 * Build length-prefixed canonical byte buffer for manifest + code digest.
 * Format: `${jsonBytes.length}:${jsonStr}`
 */
export function buildDigestPayload(m: PluginManifest): Uint8Array {
  const code = m.code ?? m.entrypoint ?? "";
  const permissions = (m.permissions || []).slice().sort();

  const canonicalObj = {
    author: m.author || "",
    code: code,
    description: m.description || "",
    expiresAt: m.expiresAt ?? 0,
    id: m.id,
    kind: m.kind || "filter",
    name: m.name,
    params: m.params || [],
    permissions: permissions,
    version: m.version,
  };

  const jsonStr = canonicalJson(canonicalObj);
  const jsonBytes = new TextEncoder().encode(jsonStr);

  const prefixStr = `${jsonBytes.length}:`;
  const prefixBytes = new TextEncoder().encode(prefixStr);

  const payload = new Uint8Array(prefixBytes.length + jsonBytes.length);
  payload.set(prefixBytes, 0);
  payload.set(jsonBytes, prefixBytes.length);
  return payload;
}

export async function pluginDigest(m: PluginManifest): Promise<Uint8Array> {
  const payload = buildDigestPayload(m);
  const subtle = getSubtleCrypto();
  const hash = await subtle.digest("SHA-256", payload as unknown as BufferSource);
  return new Uint8Array(hash);
}

function getSubtleCrypto(): SubtleCrypto {
  if (typeof crypto !== "undefined" && crypto.subtle) return crypto.subtle;
  if (typeof globalThis !== "undefined" && (globalThis as any).webcrypto?.subtle) {
    return (globalThis as any).webcrypto.subtle;
  }
  throw new Error("SubtleCrypto API unavailable in current environment");
}

/** Validate JWK shape before importing */
export function validateJwkShape(jwk: any): boolean {
  if (!jwk || typeof jwk !== "object") return false;
  if (jwk.kty !== "EC" || jwk.crv !== "P-256") return false;
  if (typeof jwk.x !== "string" || !jwk.x || typeof jwk.y !== "string" || !jwk.y) return false;
  if (jwk.key_ops && Array.isArray(jwk.key_ops) && !jwk.key_ops.includes("verify")) return false;
  if (jwk.alg && jwk.alg !== "ES256") return false;
  return true;
}

/** Import JWK or SPKI base64 key as ECDSA P-256 CryptoKey */
export async function importTrustedKey(keyData: string | JsonWebKey): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  if (typeof keyData === "object") {
    if (!validateJwkShape(keyData)) throw new Error("Invalid JWK shape for curve P-256 key_ops verify");
    return await subtle.importKey(
      "jwk",
      keyData,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
  } else if (typeof keyData === "string") {
    const trimmed = keyData.trim();
    if (trimmed.startsWith("{")) {
      const parsed = JSON.parse(trimmed);
      if (!validateJwkShape(parsed)) throw new Error("Invalid JWK JSON for curve P-256 key_ops verify");
      return await subtle.importKey(
        "jwk",
        parsed,
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
    }
    const bytes = b64ToBytes(trimmed);
    return await subtle.importKey(
      "spki",
      bytes as unknown as BufferSource,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
  }
  throw new Error("Unsupported publisher key format");
}

/** Register or replace a trusted publisher key */
export async function trustPublisherKey(id: string, keyData: string | JsonWebKey): Promise<void> {
  const key = await importTrustedKey(keyData);
  TRUSTED_KEYS[id] = key;
  TRUSTED_KEY_RAW[id] = keyData;
}

export function getTrustedKeyIds(): string[] {
  return Object.keys(TRUSTED_KEYS);
}

/** Persist and load user-trusted keys from localStorage */
export function loadTrustedKeysFromStorage(): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem("stencilmagic:trusted_keys");
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      for (const [id, keyData] of Object.entries(parsed)) {
        trustPublisherKey(id, keyData as any).catch(() => {
          console.warn(`Failed to validate trusted publisher key: ${id}`);
        });
      }
    }
  } catch {
    // Ignore invalid JSON in storage
  }
}

export function saveTrustedKeyToStorage(id: string, keyData: string | JsonWebKey): void {
  if (typeof localStorage === "undefined") return;
  try {
    const raw = localStorage.getItem("stencilmagic:trusted_keys");
    const current = raw ? JSON.parse(raw) : {};
    current[id] = keyData;
    localStorage.setItem("stencilmagic:trusted_keys", JSON.stringify(current));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Verify a plugin signature against trusted publisher public keys.
 */
export async function verifyPlugin(
  plugin: SignedPlugin | (Partial<SignedPlugin> & { manifest?: PluginManifest; id?: string; code?: string }) | null | undefined,
): Promise<PluginVerificationResult> {
  if (!plugin) {
    return { valid: false, status: "malformed", reason: "Plugin object is missing" };
  }

  const manifest: PluginManifest =
    plugin.manifest || {
      id: (plugin as { id?: string }).id || "",
      name: (plugin as any).name || "",
      version: (plugin as any).version || "1.0",
      author: (plugin as any).author,
      kind: (plugin as any).kind,
      description: (plugin as any).description,
      code: (plugin as any).code,
      params: (plugin as any).params,
    };

  if (!plugin.signature || !plugin.publisherKeyId) {
    return { valid: false, status: "unsigned", reason: "Plugin is unsigned" };
  }

  if (plugin.revoked || REVOKED_KEY_IDS.has(plugin.publisherKeyId)) {
    return { valid: false, status: "revoked", reason: "Plugin or publisher key has been revoked" };
  }

  const signedExpiry = manifest.expiresAt ?? 0;
  if (signedExpiry > 0 && Date.now() > signedExpiry) {
    return { valid: false, status: "expired", reason: "Plugin signature has expired" };
  }

  const pubKey = TRUSTED_KEYS[plugin.publisherKeyId];
  if (!pubKey) {
    return {
      valid: false,
      status: "untrusted_publisher",
      reason: `Publisher '${plugin.publisherKeyId}' is not in trusted keys list`,
    };
  }

  let sigBytes: Uint8Array;
  try {
    sigBytes = b64ToBytes(plugin.signature);
  } catch {
    return { valid: false, status: "malformed", reason: "Signature is not valid base64" };
  }

  // IEEE-P1363 ECDSA P-256 signatures are exactly 64 bytes (r: 32 bytes, s: 32 bytes)
  if (sigBytes.length !== 64) {
    return {
      valid: false,
      status: "tampered",
      reason: `Signature length invalid (${sigBytes.length} bytes; expected 64 IEEE-P1363)`,
    };
  }

  try {
    const digest = await pluginDigest(manifest);
    const subtle = getSubtleCrypto();
    const ok = await subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pubKey,
      sigBytes as unknown as BufferSource,
      digest as unknown as BufferSource,
    );

    if (ok) {
      return { valid: true, status: "verified" };
    } else {
      return { valid: false, status: "tampered", reason: "Signature verification failed (content altered)" };
    }
  } catch (e: any) {
    return { valid: false, status: "tampered", reason: e.message || String(e) };
  }
}
