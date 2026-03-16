const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

const DATA_FILE = path.join(__dirname, 'cards.json');

function readCards() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeCards(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function cleanupUploads(cards) {
  const used = new Set();
  Object.values(cards).forEach((card) => {
    if (!card) return;
    (card.images || []).forEach((p) => p && used.add(p));
    if (card.musicUrl) used.add(card.musicUrl);
  });

  const files = fs.readdirSync(uploadDir);
  files.forEach((name) => {
    const rel = `/uploads/${name}`;
    if (!used.has(rel)) {
      const full = path.join(uploadDir, name);
      try {
        fs.unlinkSync(full);
      } catch {
        // ignore
      }
    }
  });
}

app.get('/api/card', (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: 'missing id' });
  const cards = readCards();
  const card = cards[id];
  if (!card) {
    return res.json({ exists: false });
  }
  res.json({ exists: true, card });
});

app.post('/api/card', (req, res) => {
  const { id, images, musicUrl, messages } = req.body;
  if (!id) return res.status(400).json({ error: 'missing id' });
  const cards = readCards();

  // 覆盖前，尝试删除旧的上传文件，避免 uploads 目录无限变大
  const old = cards[id];
  if (old) {
    const oldFiles = []
      .concat(old.images || [])
      .concat(old.musicUrl ? [old.musicUrl] : []);

    const allCards = Object.entries(cards).filter(([key]) => key !== id);

    oldFiles.forEach((urlPath) => {
      if (!urlPath || typeof urlPath !== 'string') return;
      // 如果其他卡片还在使用这个文件，就不删
      const usedElsewhere = allCards.some(([, c]) => {
        const imgs = c.images || [];
        const mu = c.musicUrl || '';
        return imgs.includes(urlPath) || mu === urlPath;
      });
      if (usedElsewhere) return;

      const filePath = path.join(__dirname, urlPath.replace(/^\//, ''));
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // 删除失败忽略，不影响正常写入
        }
      }
    });
  }

  // 写入新内容
  cards[id] = { images, musicUrl, messages };
  writeCards(cards);
  // 全量清理：删除所有未被任何卡片引用的上传文件
  cleanupUploads(cards);
  res.json({ ok: true });
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const urlPath = `/uploads/${req.file.filename}`;
  res.json({ url: urlPath });
});

app.use('/uploads', express.static(uploadDir));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

