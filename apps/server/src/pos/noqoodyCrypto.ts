import { createDecipheriv, createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto';

/*
 * AES-256-CBC + PBKDF2 envelope used by the Noqoody SmartECR merchant API.
 * Mirrors the vendor's reference implementation exactly:
 *   key = PBKDF2(encryptionKey, "POSWifiPaymentSalt", 10000, 32, SHA-256)
 *   ciphertext = AES-256-CBC(PKCS7) with a random 16-byte IV
 *   wire form  = base64( IV(16) || ciphertext )
 * Request bodies are encrypted; encrypted responses AND the webhook `encryptedData`
 * field are decrypted the same way.
 */

const SALT = Buffer.from('POSWifiPaymentSalt', 'utf8');
const ITERATIONS = 10_000;
const KEY_SIZE = 32; // 256 bits
const IV_SIZE = 16;

function deriveKey(encryptionKey: string): Buffer {
  return pbkdf2Sync(Buffer.from(encryptionKey, 'utf8'), SALT, ITERATIONS, KEY_SIZE, 'sha256');
}

/** Encrypts an object → base64(IV || ciphertext) for the `encryptedPayload` field. */
export function encryptPayload(data: unknown, encryptionKey: string): string {
  const key = deriveKey(encryptionKey);
  const iv = randomBytes(IV_SIZE);
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  const json = JSON.stringify(data);
  const ciphertext = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, ciphertext]).toString('base64');
}

/** Decrypts a base64(IV || ciphertext) string back to a parsed JSON value. */
export function decryptPayload(encrypted: string, encryptionKey: string): unknown {
  const key = deriveKey(encryptionKey);
  const raw = Buffer.from(encrypted, 'base64');
  const iv = raw.subarray(0, IV_SIZE);
  const ciphertext = raw.subarray(IV_SIZE);
  const decipher = createDecipheriv('aes-256-cbc', key, iv);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plain.toString('utf8'));
}
