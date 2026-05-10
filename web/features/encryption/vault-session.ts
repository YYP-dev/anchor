const DEK_STORAGE_KEY = "anchor_dek_raw_b64";

function bufferSource(u: Uint8Array): BufferSource {
  return u.slice();
}

export function clearVaultSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(DEK_STORAGE_KEY);
}

export function storeDekFromCryptoKey(dek: CryptoKey): Promise<void> {
  return (async () => {
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", dek));
    storeDekRawBytes(raw);
  })();
}

export function storeDekRawBytes(raw: Uint8Array): void {
  if (typeof window === "undefined") return;
  let bin = "";
  for (let i = 0; i < raw.length; i++) bin += String.fromCharCode(raw[i]!);
  sessionStorage.setItem(DEK_STORAGE_KEY, btoa(bin));
}

export function isVaultSessionUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  return !!sessionStorage.getItem(DEK_STORAGE_KEY);
}

export async function getDekFromSession(): Promise<CryptoKey | null> {
  if (typeof window === "undefined") return null;
  const b64 = sessionStorage.getItem(DEK_STORAGE_KEY);
  if (!b64) return null;
  const bin = atob(b64);
  const raw = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
  return crypto.subtle.importKey(
    "raw",
    bufferSource(raw),
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}
