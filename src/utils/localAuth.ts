/**
 * Tài khoản đăng nhập — chỉ có một tài khoản admin, được phép cấu hình ca và xếp lịch.
 * Chỉ lưu hash PBKDF2 có salt, không lưu mật khẩu, vì code này nằm trong repo công khai
 * và trong file JS phục vụ cho trình duyệt. Đồng bộ với server/users.mjs.
 */
export const ADMIN_USERNAME = 'admin';

const ADMIN_CREDENTIAL = {
  salt: '1a46107c11e2820a6ec8fdbe4337ac28',
  iterations: 210000,
  hash: 'c0b0535b925a5324a104d03bf002cc6de4d0199bef529a525a2c467e75787aa7',
};

async function pbkdf2Hex(password: string, saltHex: string, iterations: number): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  // Salt dùng nguyên chuỗi hex (UTF-8), giống pbkdf2Sync bên server/users.mjs
  const salt = enc.encode(saltHex);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    key,
    256,
  );
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(username);
}

export function isAdmin(username: string | null | undefined): boolean {
  return username === ADMIN_USERNAME;
}

export async function verifyLocalCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  if (username !== ADMIN_USERNAME) return false;
  const { salt, iterations, hash } = ADMIN_CREDENTIAL;
  return (await pbkdf2Hex(String(password), salt, iterations)) === hash;
}
