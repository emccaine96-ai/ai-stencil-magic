import { webcrypto } from "node:crypto";
const { subtle } = webcrypto;

// Re-implement the exact canonical digest and verification logic using WebCrypto to test in Node
function canonicalJson(obj) {
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

function buildDigestPayload(m) {
  const code = m.code ?? m.entrypoint ?? "";
  const permissions = (m.permissions || []).slice().sort();

  const canonicalObj = {
    author: m.author || "",
    code: code,
    description: m.description || "",
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

async function pluginDigest(m) {
  const payload = buildDigestPayload(m);
  const hash = await subtle.digest("SHA-256", payload);
  return new Uint8Array(hash);
}

function bytesToB64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function b64ToBytes(b64) {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

async function verifyPluginInScript(p, trustedKeys) {
  if (!p || !p.manifest) return { valid: false, reason: "Missing manifest" };
  if (!p.signature || !p.publisherKeyId) return { valid: false, reason: "Unsigned plugin" };
  
  const pubKey = trustedKeys[p.publisherKeyId];
  if (!pubKey) return { valid: false, reason: "Untrusted publisher" };

  let sigBytes;
  try {
    sigBytes = b64ToBytes(p.signature);
  } catch {
    return { valid: false, reason: "Malformed signature base64" };
  }

  if (sigBytes.length !== 64) {
    return { valid: false, reason: `Invalid signature length (${sigBytes.length} bytes, expected 64)` };
  }

  try {
    const digest = await pluginDigest(p.manifest);
    const ok = await subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pubKey,
      sigBytes,
      digest
    );
    return ok ? { valid: true } : { valid: false, reason: "Signature mismatch" };
  } catch (e) {
    return { valid: false, reason: String(e) };
  }
}

async function main() {
  console.log("=== Job 1 Security Test: ECDSA P-256 Plugin Signature Verification ===");

  // 1. Generate keypair A
  const keyPairA = await subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  // Keypair B (wrong key)
  const keyPairB = await subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );

  const publisherId = "publisher-alpha";
  const trustedKeys = {
    [publisherId]: keyPairA.publicKey,
  };

  // Sample manifest + code
  const originalManifest = {
    id: "plugin.invert-stencil",
    name: "Invert Stencil Filter",
    version: "1.0.0",
    author: "Alpha Studio",
    kind: "filter",
    description: "Inverts colors in stencil buffer",
    permissions: ["filters"],
    code: "for(var i=0;i<ctx.data.length;i+=4){ctx.data[i]=255-ctx.data[i];}",
    params: []
  };

  // Sign original
  const digest = await pluginDigest(originalManifest);
  const rawSig = await subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPairA.privateKey,
    digest
  );
  const sigB64 = bytesToB64(new Uint8Array(rawSig));

  const validSignedPlugin = {
    manifest: originalManifest,
    signature: sigB64,
    publisherKeyId: publisherId,
  };

  let passedAll = true;

  // Test 1: Valid signature against trusted key
  const r1 = await verifyPluginInScript(validSignedPlugin, trustedKeys);
  console.log("Test 1 (Valid signed plugin):", r1.valid ? "PASSED" : "FAILED", r1.reason || "");
  if (!r1.valid) passedAll = false;

  // Test 2: Alter code by 1 byte
  const alteredCodeManifest = {
    ...originalManifest,
    code: "for(var i=0;i<ctx.data.length;i+=4){ctx.data[i]=254-ctx.data[i];}", // 255 -> 254
  };
  const r2 = await verifyPluginInScript({ ...validSignedPlugin, manifest: alteredCodeManifest }, trustedKeys);
  console.log("Test 2 (Code altered by 1 byte):", !r2.valid ? "PASSED (correctly rejected)" : "FAILED (accepted altered code)", r2.reason || "");
  if (r2.valid) passedAll = false;

  // Test 3: Alter manifest field (name)
  const alteredManifest = {
    ...originalManifest,
    name: "Invert Stencil Filter Hacked",
  };
  const r3 = await verifyPluginInScript({ ...validSignedPlugin, manifest: alteredManifest }, trustedKeys);
  console.log("Test 3 (Manifest name altered):", !r3.valid ? "PASSED (correctly rejected)" : "FAILED (accepted altered manifest)", r3.reason || "");
  if (r3.valid) passedAll = false;

  // Test 4: Wrong key
  const digestB = await pluginDigest(originalManifest);
  const rawSigB = await subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keyPairB.privateKey,
    digestB
  );
  const wrongKeyPlugin = {
    manifest: originalManifest,
    signature: bytesToB64(new Uint8Array(rawSigB)),
    publisherKeyId: publisherId, // claims publisherId, but signed by keyPairB
  };
  const r4 = await verifyPluginInScript(wrongKeyPlugin, trustedKeys);
  console.log("Test 4 (Signed by wrong key):", !r4.valid ? "PASSED (correctly rejected)" : "FAILED (accepted wrong key)", r4.reason || "");
  if (r4.valid) passedAll = false;

  // Test 5: Truncated signature (32 bytes instead of 64)
  const truncatedSig = bytesToB64(new Uint8Array(rawSig).slice(0, 32));
  const truncatedSigPlugin = {
    manifest: originalManifest,
    signature: truncatedSig,
    publisherKeyId: publisherId,
  };
  const r5 = await verifyPluginInScript(truncatedSigPlugin, trustedKeys);
  console.log("Test 5 (Truncated signature):", !r5.valid ? "PASSED (correctly rejected)" : "FAILED (accepted truncated signature)", r5.reason || "");
  if (r5.valid) passedAll = false;

  // Test 6: Unsigned plugin
  const unsignedPlugin = {
    manifest: originalManifest,
  };
  const r6 = await verifyPluginInScript(unsignedPlugin, trustedKeys);
  console.log("Test 6 (Unsigned plugin):", !r6.valid ? "PASSED (correctly rejected)" : "FAILED (accepted unsigned plugin)", r6.reason || "");
  if (r6.valid) passedAll = false;

  console.log("=============================================================");
  console.log("Summary:", passedAll ? "ALL PLUGIN SIGNING VERIFICATION TESTS PASSED SUCCESSFULLY!" : "SOME TESTS FAILED");
}

main().catch(console.error);
