export function nativePlugins(mobileDir?: string): string[];
export function normalizedConfig(text: string): string;
export function fingerprintOf(plugins: string[], configText: string, publicKey?: string): string;
export function nativeFingerprint(mobileDir?: string): { fingerprint: string; plugins: string[] };
