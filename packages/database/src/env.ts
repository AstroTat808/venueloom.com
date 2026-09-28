declare global {
  var Netlify: { env?: { get?: (key: string) => string | undefined } } | undefined;
}

export function getRuntimeEnv(key: string): string | undefined {
  const netlifyValue = globalThis.Netlify?.env?.get?.(key);
  if (netlifyValue !== undefined) return netlifyValue;
  return typeof process !== "undefined" ? process.env[key] : undefined;
}

export function requireRuntimeEnv(key: string): string {
  const value = getRuntimeEnv(key);
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}
