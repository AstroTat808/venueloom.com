import { createHash, randomBytes } from "node:crypto";

export function createOAuthState(): { state: string; stateHash: string; codeVerifier: string; codeChallenge: string } {
  const state = randomBytes(32).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  return {
    state,
    stateHash: createHash("sha256").update(state).digest("hex"),
    codeVerifier,
    codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url")
  };
}
