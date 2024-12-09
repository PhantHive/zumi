const crypto = require('crypto');

function generateEncryptionKey() {
  return crypto.randomBytes(32).toString('hex');
}

const encryptionKey = generateEncryptionKey();
console.log('Generated Encryption Key:', encryptionKey);