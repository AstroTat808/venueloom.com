import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const encoded = process.env.VENUELOOM_SECRET_ENCRYPTION_KEY;
  if (!encoded) throw new Error("VENUELOOM_SECRET_ENCRYPTION_KEY is not configured.");
  const value = Buffer.from(encoded, "base64");
  if (value.length !== 32) {
    throw new Error("VENUELOOM_SECRET_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return value;
}

export function encryptSecret(value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url")
  ].join(".");
}

export function decryptSecret<T>(sealed: string): T {
  const [version, ivValue, tagValue, ciphertextValue] = sealed.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Unsupported encrypted secret format.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final()
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}
