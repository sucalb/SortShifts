import { createHash } from 'crypto';

/** Tài khoản local — thêm user mới tại đây nếu cần */
const LOCAL_USERS = {
  hoangbui24: '241202',
};

export function hashPassword(password) {
  return createHash('sha256').update(String(password)).digest('hex');
}

export function verifyCredentials(username, password) {
  const expected = LOCAL_USERS[username];
  if (!expected) return false;
  return hashPassword(password) === hashPassword(expected);
}

export function isValidUsername(username) {
  return /^[a-zA-Z0-9._-]+$/.test(username);
}
