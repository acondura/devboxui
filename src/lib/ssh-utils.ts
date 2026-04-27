import { base64url } from 'jose';

/**
 * Utilities for handling SSH keys in OpenSSH format.
 */

/**
 * Converts a WebCrypto RSA public key to OpenSSH format (ssh-rsa).
 */
export async function formatRsaPublicKey(publicKey: CryptoKey): Promise<string> {
  const jwk = await crypto.subtle.exportKey('jwk', publicKey);
  if (!jwk.n || !jwk.e) throw new Error("Invalid RSA key");

  const e = base64url.decode(jwk.e);
  const n = base64url.decode(jwk.n);

  // OpenSSH ssh-rsa format: [4-byte length][type][4-byte length][e][4-byte length][n]
  const type = "ssh-rsa";
  const typeArr = new TextEncoder().encode(type);
  
  // Modulus 'n' must be treated as a signed positive integer, so if high bit is set, prepend a 0x00
  const nFormatted = n[0] & 0x80 ? new Uint8Array([0, ...n]) : n;

  const totalLength = 4 + typeArr.length + 4 + e.length + 4 + nFormatted.length;
  const buffer = new Uint8Array(totalLength);
  let offset = 0;

  const writeUint32 = (val: number) => {
    buffer[offset++] = (val >> 24) & 0xff;
    buffer[offset++] = (val >> 16) & 0xff;
    buffer[offset++] = (val >> 8) & 0xff;
    buffer[offset++] = val & 0xff;
  };

  const writeArray = (arr: Uint8Array) => {
    writeUint32(arr.length);
    buffer.set(arr, offset);
    offset += arr.length;
  };

  writeArray(typeArr);
  writeArray(e);
  writeArray(nFormatted);

  // Use a more robust base64 encoding (supported in most environments)
  const b64 = btoa(String.fromCharCode(...buffer));
  return `${type} ${b64}`;
}

/**
 * Converts a WebCrypto Private Key to PEM format.
 */
export async function formatPrivateKey(privateKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('pkcs8', privateKey);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(exported)));
  return `-----BEGIN PRIVATE KEY-----\n${b64.match(/.{1,64}/g)?.join('\n')}\n-----END PRIVATE KEY-----`;
}
