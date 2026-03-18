const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
// 线上直接使用打包后的前端静态文件
app.use(express.static(path.join(__dirname, 'frontend', 'dist')));

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

function generateId(existing) {
  let id;
  do {
    id = crypto.randomBytes(4).toString('hex');
  } while (existing[id]);
  return id;
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

// 生成新的卡片 id，并返回可直接写入 NFC 的链接
app.post('/api/new-card', (req, res) => {
  const cards = readCards();
  const id = generateId(cards);
  // 先占个位，内容为空，防止重复生成同 id
  cards[id] = { images: [], musicUrl: '', messages: [] };
  writeCards(cards);

  const origin =
    (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-host']
      ? `${req.headers['x-forwarded-proto']}://${req.headers['x-forwarded-host']}`
      : '') || '';

  const url = origin
    ? `${origin}/?id=${id}`
    : `https://你的正式域名替换这里/?id=${id}`;

  res.json({ id, url });
});

app.post('/api/card', (req, res) => {
  const { id, images, musicUrl, messages } = req.body;
  if (!id) return res.status(400).json({ error: 'missing id' });
  const cards = readCards();

  // 业务约束：一个资源只属于一个卡片
  // 因此在用户点击「修改」并保存时，直接删除该 id 旧卡片下的所有资源文件
  const old = cards[id];
  if (old) {
    const oldFiles = []
      .concat(old.images || [])
      .concat(old.musicUrl ? [old.musicUrl] : []);

    oldFiles.forEach((urlPath) => {
      if (!urlPath || typeof urlPath !== 'string') return;

      // 直接删除该卡片旧的资源文件
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

// 从上传的视频或音频中提取音频，统一转成 mp3
app.post('/api/extract-audio', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });

  const inputPath = req.file.path;
  const baseName = path.parse(req.file.filename).name;
  const outputName = `${baseName}-audio.mp3`;
  const outputPath = path.join(uploadDir, outputName);

  // ffmpeg -i input -vn -acodec libmp3lame -ab 192k output
  const ffmpeg = spawn('ffmpeg', [
    '-y',
    '-i',
    inputPath,
    '-vn',
    '-acodec',
    'libmp3lame',
    '-ab',
    '192k',
    outputPath,
  ]);

  ffmpeg.on('error', () => {
    // 进程启动失败
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    } catch {}
    res.status(500).json({ error: '音频提取失败，请稍后重试（ffmpeg not found）' });
  });

  ffmpeg.on('close', (code) => {
    // 删除临时输入文件
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
    } catch {}

    if (code !== 0) {
      // 转码失败
      try {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch {}
      return res.status(500).json({ error: '音频提取失败，请更换视频或稍后再试' });
    }

    const urlPath = `/uploads/${outputName}`;
    res.json({ url: urlPath });
  });
});

app.use('/uploads', express.static(uploadDir));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

