import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { requireRuntimeEnv } from "./env";

function encryptionKey(): Buffer {
  const raw = requireRuntimeEnv("VENUELOOM_ENCRYPTION_KEY");
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== 32) {
    throw new Error("VENUELOOM_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return decoded;
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(envelope: string): string {
  const [ivText, tagText, ciphertextText] = envelope.split(".");
  if (!ivText || !tagText || !ciphertextText) throw new Error("Invalid secret envelope");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
