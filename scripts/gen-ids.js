// 批量生成表白卡 id 的小工具
// 用法示例：
//   node scripts/gen-ids.js           // 默认生成 10 个
//   node scripts/gen-ids.js 50        // 生成 50 个
//
// 开发环境：会请求本地的 http://localhost:3000/api/new-card
// 上线后：把 BASE_URL 改成你的正式域名，如 'https://love.yourdomain.com'

const https = require('https')
const http = require('http')

// TODO: 上线后把这里改成你的正式域名，如：'https://love.xxx.com'
const BASE_URL = 'http://localhost:3000'

const DEFAULT_COUNT = 10

function createOne() {
  return new Promise((resolve, reject) => {
    const url = new URL('/api/new-card', BASE_URL)
    const isHttps = url.protocol === 'https:'
    const client = isHttps ? https : http

    const req = client.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            resolve(json)
          } catch (e) {
            reject(e)
          }
        })
      },
    )

    req.on('error', reject)
    req.end()
  })
}

async function main() {
  const arg = process.argv[2]
  const count = Number.isInteger(Number(arg)) && Number(arg) > 0 ? Number(arg) : DEFAULT_COUNT

  console.log(`即将生成 ${count} 个卡片 id（请求：${BASE_URL}/api/new-card）\n`)

  const results = []
  for (let i = 0; i < count; i++) {
    try {
      const res = await createOne()
      results.push(res)
      console.log(`${i + 1}. id=${res.id}    url=${res.url}`)
    } catch (e) {
      console.error(`第 ${i + 1} 个生成失败：`, e.message || e)
    }
  }

  console.log('\n生成完成，可将以下列表复制到 Excel：\n')
  console.log('序号\tid\turl')
  results.forEach((r, idx) => {
    console.log(`${idx + 1}\t${r.id}\t${r.url}`)
  })
}

main().catch((e) => {
  console.error('批量生成失败：', e)
  process.exit(1)
})

