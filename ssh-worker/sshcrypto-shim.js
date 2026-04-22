// Impersonate ssh2-crypto using node:crypto with a unique name to avoid bundle conflicts
import * as nodeCrypto from 'node:crypto';

export const randomBytes = nodeCrypto.randomBytes;
export const createHash = nodeCrypto.createHash;
export const createHmac = nodeCrypto.createHmac;
export const pbkdf2Sync = nodeCrypto.pbkdf2Sync;

// Export a dummy for anything else to avoid crashes
export default {
  randomBytes,
  createHash,
  createHmac,
  pbkdf2Sync
};
