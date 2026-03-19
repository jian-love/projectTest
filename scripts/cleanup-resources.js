// 一键清理上传资源（用于二次使用）
// 用法示例：
//   node scripts/cleanup-resources.js
//   node scripts/cleanup-resources.js --purge-uploads
//   node scripts/cleanup-resources.js --reset-cards
//   node scripts/cleanup-resources.js --reset-cards --purge-uploads

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const uploadsDir = path.join(ROOT, 'uploads')
const dataFile = path.join(ROOT, 'cards.json')

const args = process.argv.slice(2)
const purgeUploads = args.includes('--purge-uploads')
const resetCards = args.includes('--reset-cards')

function readCards() {
  if (!fs.existsSync(dataFile)) return {}
  try {
    const raw = fs.readFileSync(dataFile, 'utf-8')
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeCards(cards) {
  fs.writeFileSync(dataFile, JSON.stringify(cards, null, 2), 'utf-8')
}

function deleteIfExists(p) {
  try {
    if (fs.existsSync(p)) fs.unlinkSync(p)
  } catch {
    // ignore
  }
}

function main() {
  if (resetCards) {
    writeCards({})
    console.log('[cleanup] 已重置 cards.json 为 {}')
  }

  if (!fs.existsSync(uploadsDir)) {
    console.log('[cleanup] uploads 目录不存在，无需清理')
    return
  }

  if (purgeUploads) {
    const names = fs.readdirSync(uploadsDir)
    names.forEach((n) => deleteIfExists(path.join(uploadsDir, n)))
    console.log('[cleanup] 已清空 uploads 目录所有文件')
    return
  }

  // 默认策略：删除所有未被 cards.json 引用的上传文件
  const cards = readCards()
  const used = new Set()
  Object.values(cards).forEach((c) => {
    if (!c) return
    ;(c.images || []).forEach((p) => p && used.add(p))
    if (c.musicUrl) used.add(c.musicUrl)
  })

  const names = fs.readdirSync(uploadsDir)
  let deleted = 0
  names.forEach((name) => {
    const rel = `/uploads/${name}`
    if (!used.has(rel)) {
      deleteIfExists(path.join(uploadsDir, name))
      deleted++
    }
  })
  console.log(`[cleanup] 删除未引用资源：${deleted} 个文件`)
}

main()

