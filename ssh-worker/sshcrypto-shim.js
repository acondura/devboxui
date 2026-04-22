// Impersonate ssh2-crypto using node:crypto
import crypto from 'node:crypto';

export const randomBytes = crypto.randomBytes;
export const createHash = crypto.createHash;
export const createHmac = crypto.createHmac;
export const pbkdf2Sync = crypto.pbkdf2Sync;

// Export a dummy for anything else to avoid crashes
export default {
  randomBytes,
  createHash,
  createHmac,
  pbkdf2Sync
};
