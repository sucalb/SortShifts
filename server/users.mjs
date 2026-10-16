import { pbkdf2Sync, timingSafeEqual } from 'crypto';

/** Chỉ có một tài khoản admin. Lưu hash PBKDF2 có salt — đồng bộ với src/utils/localAuth.ts */
const ADMIN_USERNAME = 'admin';
const ADMIN_CREDENTIAL = {
  salt: '1a46107c11e2820a6ec8fdbe4337ac28',
  iterations: 210000,
  hash: 'c0b0535b925a5324a104d03bf002cc6de4d0199bef529a525a2c467e75787aa7',
};

export function verifyCredentials(username, password) {
  if (username !== ADMIN_USERNAME) return false;
  const { salt, iterations, hash } = ADMIN_CREDENTIAL;
  const actual = pbkdf2Sync(String(password), salt, iterations, 32, 'sha256');
  return timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}

export function isValidUsername(username) {
  return /^[a-zA-Z0-9._-]+$/.test(username);
}
