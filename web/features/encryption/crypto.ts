const PBKDF2_ITERATIONS = 210_000;

/** Copy bytes so Web Crypto sees a concrete ArrayBuffer (strict TS DOM libs). */
function bufferSource(u: Uint8Array): BufferSource {
  return u.slice();
}

export interface WrappedBlob {
  v: number;
  iv: string;
  ct: string;
}

function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomSaltBase64(length = 16): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return toBase64(bytes);
}

export function randomRecoverySecretBase64(numBytes = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(numBytes));
  return toBase64(bytes);
}

export async function deriveKeyFromPassword(
  password: string,
  saltB64: string,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const salt = fromBase64(saltB64);
  const material = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: bufferSource(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function deriveKeyFromRecoverySecret(
  recoverySecretB64: string,
  saltB64: string,
): Promise<CryptoKey> {
  const secretBytes = fromBase64(recoverySecretB64);
  const salt = fromBase64(saltB64);
  const material = await crypto.subtle.importKey(
    "raw",
    bufferSource(secretBytes),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: bufferSource(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function generateDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function wrapDek(dek: CryptoKey, kek: CryptoKey): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", dek));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: bufferSource(iv) },
      kek,
      bufferSource(raw),
    ),
  );
  const blob: WrappedBlob = { v: 1, iv: toBase64(iv), ct: toBase64(ct) };
  return JSON.stringify(blob);
}

export async function unwrapDek(
  wrappedJson: string,
  kek: CryptoKey,
): Promise<CryptoKey> {
  const blob = JSON.parse(wrappedJson) as WrappedBlob;
  const iv = fromBase64(blob.iv);
  const ct = fromBase64(blob.ct);
  const raw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bufferSource(iv) },
    kek,
    bufferSource(ct),
  );
  return crypto.subtle.importKey(
    "raw",
    bufferSource(new Uint8Array(raw)),
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
}

export async function encryptNoteContentUtf8(
  plaintext: string,
  dek: CryptoKey,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: bufferSource(iv) },
      dek,
      enc.encode(plaintext),
    ),
  );
  return JSON.stringify({
    v: 1,
    k: "note",
    iv: toBase64(iv),
    ct: toBase64(ct),
  });
}

export async function decryptNoteContentUtf8(
  ciphertextJson: string,
  dek: CryptoKey,
): Promise<string> {
  const blob = JSON.parse(ciphertextJson) as {
    iv: string;
    ct: string;
  };
  const iv = fromBase64(blob.iv);
  const ct = fromBase64(blob.ct);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bufferSource(iv) },
    dek,
    bufferSource(ct),
  );
  return new TextDecoder().decode(plainBuf);
}

export async function createRegistrationVault(password: string): Promise<{
  passwordKdfSalt: string;
  recoveryKdfSalt: string;
  dekPasswordWrapped: string;
  dekRecoveryWrapped: string;
  recoverySecretBase64: string;
}> {
  const passwordKdfSalt = randomSaltBase64();
  const recoveryKdfSalt = randomSaltBase64();
  const recoverySecretBase64 = randomRecoverySecretBase64();
  const dek = await generateDek();
  const pwKek = await deriveKeyFromPassword(password, passwordKdfSalt);
  const recKek = await deriveKeyFromRecoverySecret(
    recoverySecretBase64,
    recoveryKdfSalt,
  );
  const dekPasswordWrapped = await wrapDek(dek, pwKek);
  const dekRecoveryWrapped = await wrapDek(dek, recKek);
  return {
    passwordKdfSalt,
    recoveryKdfSalt,
    dekPasswordWrapped,
    dekRecoveryWrapped,
    recoverySecretBase64,
  };
}

export async function unlockVaultWithPassword(
  password: string,
  encryption: {
    dekPasswordWrapped: string;
    passwordKdfSalt: string;
  },
): Promise<CryptoKey> {
  const kek = await deriveKeyFromPassword(password, encryption.passwordKdfSalt);
  return unwrapDek(encryption.dekPasswordWrapped, kek);
}

export async function wrapVaultForNewPassword(
  dek: CryptoKey,
  newPassword: string,
): Promise<{ passwordKdfSalt: string; dekPasswordWrapped: string }> {
  const passwordKdfSalt = randomSaltBase64();
  const kek = await deriveKeyFromPassword(newPassword, passwordKdfSalt);
  const dekPasswordWrapped = await wrapDek(dek, kek);
  return { passwordKdfSalt, dekPasswordWrapped };
}
