const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 配置：根据你线上最终域名改这里（本地测试可以先不改）
const BASE_URL = 'http://tomylove.online';

const DATA_FILE = path.join(__dirname, '..', 'cards.json');

function readCards() {
  if (!fs.existsSync(DATA_FILE)) return {};
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const cards = raw ? JSON.parse(raw) : {};
    Object.values(cards).forEach((card) => {
      if (card && card.reserved === undefined) card.reserved = true;
    });
    return cards;
  } catch {
    return {};
  }
}

function writeCards(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function generateId(existing) {
  let id;
  do {
    id = crypto.randomBytes(4).toString('hex');
  } while (existing[id]);
  return id;
}

function main() {
  const arg = process.argv[2];
  const count = Math.max(1, Math.min(10000, Number(arg) || 1)); // 默认 1，最大 10000

  const cards = readCards();
  const created = [];

  for (let i = 0; i < count; i++) {
    const id = generateId(cards);
    cards[id] = { reserved: true, images: [], musicUrl: '', messages: [] };
    created.push(id);
  }

  writeCards(cards);

  console.log(`成功生成 ${created.length} 个 ID：`);
  console.log('----------------------------------------');
  created.forEach((id) => {
    const url = `${BASE_URL}/?id=${id}`;
    console.log(`${id}\t${url}`);
  });
  console.log('----------------------------------------');
  console.log('注意：记得把 BASE_URL 改成你线上正式域名。');
}

main();

