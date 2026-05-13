const ITERATIONS = 200_000;
const MARKER = 'abcdiary-v1';

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes));
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return new Uint8Array(bytes.buffer.slice(0) as ArrayBuffer);
}

async function deriveKey(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    raw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function setupPin(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16) as Uint8Array<ArrayBuffer>);
  const key = await deriveKey(pin, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12) as Uint8Array<ArrayBuffer>);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(MARKER)
  );
  return { salt: toB64(salt), verifierIv: toB64(iv), verifierCt: toB64(ct) };
}

export async function verifyPin(
  pin: string,
  salt: string,
  verifierIv: string,
  verifierCt: string
): Promise<CryptoKey | null> {
  try {
    const key = await deriveKey(pin, fromB64(salt));
    const dec = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(verifierIv) },
      key,
      fromB64(verifierCt)
    );
    if (new TextDecoder().decode(dec) === MARKER) return key;
    return null;
  } catch {
    return null;
  }
}

export async function encryptData(data: object, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12) as Uint8Array<ArrayBuffer>);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(JSON.stringify(data))
  );
  return { iv: toB64(iv), ciphertext: toB64(ct) };
}

export async function decryptData(iv: string, ciphertext: string, key: CryptoKey): Promise<object> {
  const dec = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(iv) },
    key,
    fromB64(ciphertext)
  );
  return JSON.parse(new TextDecoder().decode(dec));
}
