import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { verifyCredentials, isValidUsername } from './users.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const USERS_DIR = path.join(DATA_DIR, 'users');
const PORT = process.env.PORT || 3001;

/** @type {Map<string, { username: string; createdAt: string }>} */
const sessions = new Map();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(USERS_DIR, { recursive: true });
}

function userConfigPath(username) {
  return path.join(USERS_DIR, `${username}.json`);
}

async function readUserConfig(username) {
  try {
    const raw = await fs.readFile(userConfigPath(username), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeUserConfig(username, config) {
  await ensureDataDir();
  const payload = {
    ...config,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(userConfigPath(username), JSON.stringify(payload, null, 2));
}

function getSession(req) {
  const token = req.headers['x-auth-token'];
  if (!token || typeof token !== 'string') return null;
  return sessions.get(token) ?? null;
}

function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) {
    return res.status(401).json({ error: 'Chưa đăng nhập hoặc phiên đã hết hạn' });
  }
  req.user = session;
  next();
}

function dataPath(shareId: string) {
  return path.join(DATA_DIR, `${shareId}.json`);
}

async function readShare(shareId: string) {
  try {
    const raw = await fs.readFile(dataPath(shareId), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeShare(shareId: string, data: object) {
  await ensureDataDir();
  data.updatedAt = new Date().toISOString();
  await fs.writeFile(dataPath(shareId), JSON.stringify(data, null, 2));
}

function publicPayload(record: Record<string, unknown>) {
  const { adminToken: _, ...rest } = record;
  return rest;
}

app.post('/api/auth/login', async (req, res) => {
  const username = String(req.body.username ?? '').trim();
  const password = String(req.body.password ?? '');

  if (!username || !password) {
    return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
  }
  if (!isValidUsername(username)) {
    return res.status(400).json({ error: 'Tên đăng nhập không hợp lệ' });
  }
  if (!verifyCredentials(username, password)) {
    return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu' });
  }

  const token = randomUUID();
  sessions.set(token, { username, createdAt: new Date().toISOString() });
  res.json({ token, username });
});

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const token = req.headers['x-auth-token'];
  if (typeof token === 'string') sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ username: req.user.username });
});

app.get('/api/user/config', requireAuth, async (req, res) => {
  const config = await readUserConfig(req.user.username);
  res.json({ config });
});

app.put('/api/user/config', requireAuth, async (req, res) => {
  const {
    weekStart,
    shifts,
    roster,
    registrationGrid,
    slotOverrides,
    classColors,
    fixedTaMap,
    sheetsWebhook,
    sheetsAutoPush,
  } = req.body ?? {};

  if (!weekStart || !Array.isArray(shifts) || !Array.isArray(roster) || !registrationGrid) {
    return res.status(400).json({ error: 'Dữ liệu cấu hình không hợp lệ' });
  }

  await writeUserConfig(req.user.username, {
    weekStart,
    shifts,
    roster,
    registrationGrid,
    slotOverrides,
    classColors: classColors ?? {},
    fixedTaMap: fixedTaMap ?? {},
    sheetsWebhook: sheetsWebhook ?? '',
    sheetsAutoPush: Boolean(sheetsAutoPush),
  });

  const config = await readUserConfig(req.user.username);
  res.json({ config });
});

app.post('/api/share', async (req, res) => {
  const shareId = randomUUID().slice(0, 8);
  const adminToken = randomUUID();
  const record = {
    shareId,
    adminToken,
    weekStart: req.body.weekStart,
    shifts: req.body.shifts ?? [],
    roster: req.body.roster ?? [],
    slotOverrides: req.body.slotOverrides,
    staff: req.body.staff ?? [],
    updatedAt: new Date().toISOString(),
  };
  await writeShare(shareId, record);
  res.json({
    shareId,
    adminToken,
    guestUrl: `/dang-ky/${shareId}`,
  });
});

app.get('/api/share/:shareId', async (req, res) => {
  const record = await readShare(req.params.shareId);
  if (!record) return res.status(404).json({ error: 'Không tìm thấy lịch chia sẻ' });
  res.json(publicPayload(record));
});

app.put('/api/share/:shareId', async (req, res) => {
  const record = await readShare(req.params.shareId);
  if (!record) return res.status(404).json({ error: 'Không tìm thấy lịch chia sẻ' });
  if (req.headers['x-admin-token'] !== record.adminToken) {
    return res.status(403).json({ error: 'Không có quyền admin' });
  }
  const updated = {
    ...record,
    weekStart: req.body.weekStart ?? record.weekStart,
    shifts: req.body.shifts ?? record.shifts,
    roster: req.body.roster ?? record.roster,
    slotOverrides: req.body.slotOverrides ?? record.slotOverrides,
    staff: req.body.staff ?? record.staff,
  };
  await writeShare(req.params.shareId, updated);
  res.json(publicPayload(updated));
});

app.post('/api/share/:shareId/register', async (req, res) => {
  const record = await readShare(req.params.shareId);
  if (!record) return res.status(404).json({ error: 'Không tìm thấy lịch chia sẻ' });

  const { fullName, abbreviation } = req.body;
  if (!fullName?.trim()) {
    return res.status(400).json({ error: 'Thiếu tên trợ giảng' });
  }

  const existing = record.staff.find(
    (s: { name: string }) => s.name.trim().toLowerCase() === fullName.trim().toLowerCase(),
  );
  if (existing) {
    return res.json({ staff: existing });
  }

  const newStaff = {
    id: `staff-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: fullName.trim(),
    abbreviation: abbreviation?.trim() || undefined,
    availability: Object.fromEntries(
      [0, 1, 2, 3, 4, 5, 6].map((d) => [
        d,
        Object.fromEntries(
          ['reg-0', 'reg-1', 'reg-2', 'reg-3', 'reg-4', 'reg-5', 'reg-6'].map((s) => [s, false]),
        ),
      ]),
    ),
  };

  record.staff.push(newStaff);
  await writeShare(req.params.shareId, record);
  res.json({ staff: newStaff });
});

app.patch('/api/share/:shareId/staff/:staffId', async (req, res) => {
  const record = await readShare(req.params.shareId);
  if (!record) return res.status(404).json({ error: 'Không tìm thấy lịch chia sẻ' });

  const idx = record.staff.findIndex((s: { id: string }) => s.id === req.params.staffId);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy trợ giảng' });

  if (req.body.availability) {
    record.staff[idx] = {
      ...record.staff[idx],
      availability: req.body.availability,
    };
  }

  await writeShare(req.params.shareId, record);
  res.json({ staff: record.staff[idx] });
});

const distPath = path.join(__dirname, '..', 'dist');

async function start() {
  try {
    const { accessSync } = await import('fs');
    accessSync(distPath);
    app.use(express.static(distPath));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log('Serving static files from dist/');
  } catch {
    console.log('No dist/ — API only (run vite dev for frontend)');
  }

  app.listen(PORT, () => {
    console.log(`Server: http://localhost:${PORT}`);
  });
}

start();
