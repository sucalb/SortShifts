/** Tài khoản local — dùng khi không có API (vd. deploy Vercel). Đồng bộ với server/users.mjs */
const LOCAL_USERS: Record<string, string> = {
  hoangbui24: '241202',
};

export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(String(password));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(username);
}

export async function verifyLocalCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  const expected = LOCAL_USERS[username];
  if (!expected) return false;
  const [a, b] = await Promise.all([hashPassword(password), hashPassword(expected)]);
  return a === b;
}
