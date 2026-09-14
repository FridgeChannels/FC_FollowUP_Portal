const HASH_PREFIX = "pbkdf2";
const ITERATIONS = 100_000;
const KEY_BITS = 256;
const SALT_BYTES = 16;

function bytesToB64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function b64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    material,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

export function isPasswordHash(value?: string | null) {
  return !!value?.startsWith(`${HASH_PREFIX}$`);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `${HASH_PREFIX}$${ITERATIONS}$${bytesToB64(salt)}$${bytesToB64(hash)}`;
}

async function verifyHash(password: string, stored: string) {
  const [, iterationText, saltB64, hashB64] = stored.split("$");
  const iterations = Number(iterationText);
  if (!iterations || !saltB64 || !hashB64) return false;
  const actual = bytesToB64(await derive(password, b64ToBytes(saltB64), iterations));
  return timingSafeEqual(actual, hashB64);
}

export async function verifyPassword(
  password: string,
  stored?: string | null,
): Promise<{ ok: boolean; upgradedHash?: string }> {
  const value = stored?.trim() || "";
  if (!password || !value) return { ok: false };
  if (isPasswordHash(value)) return { ok: await verifyHash(password, value) };
  if (!timingSafeEqual(password, value)) return { ok: false };
  return { ok: true, upgradedHash: await hashPassword(password) };
}
