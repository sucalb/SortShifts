import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
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
