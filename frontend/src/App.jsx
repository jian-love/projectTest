import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import './App.css'

// 前端跟随当前域名，开发环境通过 Vite 代理到 3000
const API_BASE = ''

function useQueryId() {
  const search = window.location.search
  const params = useMemo(() => new URLSearchParams(search), [search])
  const id = params.get('id')
  return id
}

function App() {
  const id = useQueryId()
  const [loading, setLoading] = useState(true)
  const [card, setCard] = useState(null)
  const [hasAccess, setHasAccess] = useState(false)
  const [error, setError] = useState('')
  const [viewMode, setViewMode] = useState('auto') // auto | edit

  useEffect(() => {
    async function fetchCard() {
      try {
        const res = await fetch(`${API_BASE}/api/card?id=${encodeURIComponent(id)}`)
        const data = await res.json()
        if (data.exists && data.card) {
          setCard(data.card)
          setHasAccess(true)
        }
        if (!data.exists) {
          setCard(null)
          setHasAccess(false)
        }
      } catch {
        setError('加载失败，请稍后重试')
        setHasAccess(false)
      } finally {
        setLoading(false)
      }
    }
    fetchCard()
  }, [id])

  if (loading) {
    return (
      <div className="page">
        <div className="card">
          <div className="title">深处礼物</div>
          <div className="sub">正在加载你的专属表白...</div>
        </div>
      </div>
    )
  }

  const isEmptyCard =
    !card || !card.images || !Array.isArray(card.images) || card.images.length === 0

  if (!hasAccess) {
    return (
      <div className="page">
        <div className="card">
          <div className="title">无效卡片</div>
          <div className="sub">此卡片尚未开通或 ID 不正确，请使用购买后获取的链接。</div>
        </div>
      </div>
    )
  }

  if (viewMode === 'edit' || isEmptyCard) {
    return (
      <MakerView
        id={id}
        onCreated={(newCard) => {
          setCard(newCard)
          setViewMode('auto')
        }}
      />
    )
  }

  return (
    <PlayView
      id={id}
      card={card}
      error={error}
      onRequestEdit={() => setViewMode('edit')}
    />
  )
}

// 图片压缩：限制最大边长，降低质量，减少上传体积
function compressImage(file, maxSize = 1280, quality = 0.8) {
  return new Promise((resolve) => {
    if (!file || !file.type || !file.type.startsWith('image/')) {
      resolve(file)
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width <= maxSize && height <= maxSize) {
          resolve(file)
          return
        }

        const scale = Math.min(maxSize / width, maxSize / height)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(width * scale)
        canvas.height = Math.round(height * scale)
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file)
              return
            }
            const compressed = new File([blob], file.name || 'image.jpg', {
              type: 'image/jpeg',
            })
            resolve(compressed)
          },
          'image/jpeg',
          quality,
        )
      }
      img.onerror = () => resolve(file)
      img.src = reader.result
    }
    reader.onerror = () => resolve(file)
    reader.readAsDataURL(file)
  })
}

function MakerView({ id, onCreated }) {
  const [images, setImages] = useState([])
  const [music, setMusic] = useState(null)
  const [musicPreviewUrl, setMusicPreviewUrl] = useState('')
  const [lines, setLines] = useState(['', '', '', ''])
  const [submitting, setSubmitting] = useState(false)

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files || []).slice(0, 6)
    setImages(files)
    // 重置 input 的值，避免部分手机重复选择同一张图片不触发 change
    if (e.target) {
      e.target.value = ''
    }
  }

  const handleMusicChange = (e) => {
    const file = e.target.files?.[0] || null
    if (file) {
      // 允许视频/音频文件，统一作为“提取音乐”的原素材
      // 限制文件大小，避免大文件在弱网环境下频繁上传失败（默认上限 30MB）
      const maxSize = 8 * 1024 * 1024
      if (file.size > maxSize) {
        alert('视频/音频文件过大，建议截取 60 秒以内的片段（小于 30MB）再上传')
        if (e.target) {
          e.target.value = ''
        }
        return
      }
      setMusic(file)
      if (musicPreviewUrl) {
        URL.revokeObjectURL(musicPreviewUrl)
      }
      setMusicPreviewUrl(URL.createObjectURL(file))
    } else {
      setMusic(null)
      if (musicPreviewUrl) {
        URL.revokeObjectURL(musicPreviewUrl)
      }
      setMusicPreviewUrl('')
    }
    if (e.target) {
      e.target.value = ''
    }
  }

  const handleLineChange = (index, value) => {
    const copy = [...lines]
    copy[index] = value
    setLines(copy)
  }

  const uploadFile = async (file) => {
    let toUpload = file
    // 对图片做一次压缩，减小体积，加快上传与加载
    if (file && file.type && file.type.startsWith('image/')) {
      toUpload = await compressImage(file)
    }
    const form = new FormData()
    form.append('file', toUpload, toUpload.name || file.name)
    // 安全约束：仅允许上传到服务器预留的卡片 id
    form.append('id', id)
    const res = await fetch(`${API_BASE}/api/upload`, {
      method: 'POST',
      body: form,
    })
    const data = await res.json()
    return data.url
  }

  const handleSubmit = async () => {
    if (!images.length) {
      alert('请至少选择一张图片')
      return
    }
    setSubmitting(true)
    try {
      const imageUrls = []
      for (const f of images) {
        imageUrls.push(await uploadFile(f))
      }
      let musicUrl = ''
      if (music) {
        const form = new FormData()
        form.append('file', music)
        // 安全约束：仅允许提取到服务器预留的卡片 id
        form.append('id', id)
        const res = await fetch(`${API_BASE}/api/extract-audio`, {
          method: 'POST',
          body: form,
        })
        const data = await res.json()
        if (!res.ok || !data.url) {
          alert(data.error || '提取音乐失败，请稍后再试或更换视频')
          setSubmitting(false)
          return
        }
        musicUrl = data.url
      }
      const messages = lines.map((v) => v.trim()).filter(Boolean)
      const res = await fetch(`${API_BASE}/api/card`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          images: imageUrls,
          musicUrl,
          messages,
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        alert(data.error || '提交失败')
        return
      }
      onCreated({
        images: imageUrls,
        musicUrl,
        messages,
      })
    } catch (e) {
      console.error(e)
      alert('提交失败，请稍后再试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <div className="card">
        <div className="title">深处礼物 · 制作</div>
        <div className="sub">这是属于你的专属 NFC 表白卡</div>

        <div className="section-title">选择图片（不超过六张）</div>
        <div className="upload-box">
          <label className="upload-btn">
            选择图片
            <input type="file" accept="image/*" multiple onChange={handleImageChange} />
          </label>
          <div className="pill">
            {images.length ? `已选择 ${images.length} 张` : '未选择图片'}
          </div>
        </div>

        <div className="section-title">提取音乐（从视频 / 录屏中自动提取，建议不超过 60 秒）</div>
        <div className="upload-box">
          <label className="upload-btn">
            提取音乐
            <input type="file" accept="video/*" onChange={handleMusicChange} />
          </label>
          <div className="pill">{music ? music.name : '未选择音乐'}</div>
          {musicPreviewUrl && (
            <div style={{ marginTop: 8, width: '100%' }}>
              <audio
                controls
                src={musicPreviewUrl}
                style={{ width: '100%' }}
              />
            </div>
          )}
        </div>

        <div className="section-title">输入文案（每句不超过十字）</div>
        {lines.map((v, i) => (
          <input
            key={i}
            className="input"
            placeholder="请输入想说的话..."
            maxLength={10}
            value={v}
            onChange={(e) => handleLineChange(i, e.target.value)}
          />
        ))}

        <button
          className="submit-btn"
          disabled={submitting}
          onClick={handleSubmit}
        >
          {submitting ? '提交中...' : '提交'}
        </button>
        <div className="center-tip">提交后，下次再扫卡就会直接看到表白动效</div>
      </div>
    </div>
  )
}

function PlayView({ card, error, onRequestEdit }) {
  const [phase, setPhase] = useState('cube') // 'cube' | 'text'
  const audioRef = useRef(null)
  const containerRef = useRef(null)
  const longPressTimer = useRef(null)
  const longPressActive = useRef(false)

  // 页面进入时，如果有音乐，尝试自动播放一次
  useEffect(() => {
    if (!card.musicUrl || !audioRef.current) return
    const audio = audioRef.current
    audio.src = `${API_BASE}${card.musicUrl}`
    audio
      .play()
      .then(() => {
        // 自动播放成功就保持当前 phase 逻辑
      })
      .catch(() => {
        // 浏览器策略禁止自动播放时忽略，用户点击后再播放
      })
  }, [card.musicUrl])

  useEffect(() => {
    if (phase !== 'cube') {
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }
      return
    }
    if (!containerRef.current) return
    const el = containerRef.current
    const loader = new THREE.TextureLoader()
    const urls = card.images || []
    const faceUrls = []
    for (let i = 0; i < 6; i++) {
      faceUrls.push(urls.length ? `${API_BASE}${urls[i % urls.length]}` : '')
    }

    const width = el.clientWidth || 300
    const height = el.clientHeight || 500

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x050308)

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000)
    camera.position.set(0, 0, 9)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    el.innerHTML = ''
    el.appendChild(renderer.domElement)

    const keyLight = new THREE.PointLight(0xffffff, 1.15)
    keyLight.position.set(5, 6, 8)
    scene.add(keyLight)
    scene.add(new THREE.AmbientLight(0xffffff, 0.35))

    const disposables = { geometries: [], materials: [] }
    let frameId = 0
    let t = 0

    const handleResize = () => {
      if (!containerRef.current) return
      const w = containerRef.current.clientWidth
      const h = containerRef.current.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    const loadTex = (url, mat) => {
      if (!url) return
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace
          mat.map = tex
          mat.needsUpdate = true
        },
        undefined,
        () => {},
      )
    }

    /** —— 礼盒模式：外层六面规整 + 中心小立方体 + 舞台光效 —— */
    {
      // 外层：规整六面，间隔拉大，只做横向旋转
      const outer = new THREE.Group()
      scene.add(outer)
      // 外层礼盒围成的图片大小与间距，可按需微调
      const shellDistance = 2.3 // 礼盒离中心的距离，越大缝隙越大
      const faceSize = 2.4 // 礼盒六面的宽高
      const shellCfg = [
        [shellDistance, 0, 0, 0, -Math.PI / 2, 0], // 右
        [-shellDistance, 0, 0, 0, Math.PI / 2, 0], // 左
        [0, shellDistance, 0, Math.PI / 2, 0, 0], // 上
        [0, -shellDistance, 0, -Math.PI / 2, 0, 0], // 下
        [0, 0, shellDistance, 0, 0, 0], // 前
        [0, 0, -shellDistance, 0, Math.PI, 0], // 后
      ]
      shellCfg.forEach(([px, py, pz, rx, ry, rz], i) => {
        const geo = new THREE.PlaneGeometry(faceSize, faceSize)
        disposables.geometries.push(geo)
        const mat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.96,
          side: THREE.DoubleSide,
        })
        disposables.materials.push(mat)
        const mesh = new THREE.Mesh(geo, mat)
        mesh.position.set(px, py, pz)
        mesh.rotation.set(rx, ry, rz)
        outer.add(mesh)
        loadTex(faceUrls[i], mat)
      })

      // 远处少量星点，增加空间感
      const starGeo = new THREE.BufferGeometry()
      const starCount = 120
      const starPositions = new Float32Array(starCount * 3)
      const starRadius = 20
      const starMinRadius = 14 // 保证星星离礼盒有一定距离，不会太靠近
      for (let i = 0; i < starCount; i++) {
        const idx = i * 3
        const theta = Math.random() * Math.PI * 2
        const phi = (Math.random() - 0.5) * (Math.PI / 2)
        const rand = Math.random()
        const r = starMinRadius + (starRadius - starMinRadius) * rand
        starPositions[idx] = r * Math.cos(phi) * Math.cos(theta)
        starPositions[idx + 1] = r * Math.sin(phi)
        starPositions[idx + 2] = r * Math.cos(phi) * Math.sin(theta)
      }
      starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
      disposables.geometries.push(starGeo)
      const starMat = new THREE.PointsMaterial({
        color: 0xffffff, // 白色星星
        size: 0.12,
        transparent: true,
        opacity: 0.9,
      })
      disposables.materials.push(starMat)
      const stars = new THREE.Points(starGeo, starMat)
      scene.add(stars)

      // 中心小立方体礼物盒
      const innerMats = faceUrls.map(
        () =>
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
          }),
      )
      innerMats.forEach((m) => disposables.materials.push(m))
      const innerGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4)
      disposables.geometries.push(innerGeo)
      const innerCube = new THREE.Mesh(innerGeo, innerMats)
      innerCube.position.set(0, 0, 0.4)
      scene.add(innerCube)
      faceUrls.forEach((url, i) => loadTex(url, innerMats[i]))

      const animate = () => {
        t += 0.005
        // 外层礼盒：匀速横向
        outer.rotation.y = t * 0.9

        // 小立方体：匀速绕 Y，自慢绕 X，六面都会轮流出现
        innerCube.rotation.y = t * 1.1              // 主自转
        innerCube.rotation.x = t * 0.35             // 叠加一个慢速俯仰
        innerCube.rotation.z = Math.sin(t * 0.6) * 0.15 // 轻微摇摆，避免太机械

        const breathe = 1 + Math.sin(t * 1.7) * 0.06
        innerCube.scale.set(breathe, breathe, breathe)
        // 星点闪烁：在 0.2~1.0 之间明显变化
        const flicker = 0.5 + 0.5 * Math.sin(t * 3.0)
        starMat.opacity = 0.2 + 0.8 * flicker

        camera.position.x = Math.sin(t * 0.18) * 0.7   // 横向稍大一点
        camera.position.y = Math.sin(t * 0.12) * 0.18  // 上下幅度更小
        camera.position.z = 15  
        camera.lookAt(0, 0, 0.2)
        renderer.render(scene, camera)
        frameId = requestAnimationFrame(animate)
      }
      animate()
    }

    const mountEl = el
    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', handleResize)
      disposables.geometries.forEach((g) => g.dispose())
      disposables.materials.forEach((m) => {
        if (m.map) m.map.dispose()
        m.dispose()
      })
      renderer.dispose()
      if (mountEl) {
        mountEl.innerHTML = ''
      }
    }
  }, [card.images, phase])

  const handleTap = () => {
    // 第一次点击：如果有音乐且尚未播放，只负责「开音乐」
    if (card.musicUrl && audioRef.current && audioRef.current.paused) {
      audioRef.current.src = `${API_BASE}${card.musicUrl}`
      audioRef.current.play().catch(() => {})
      return
    }
    // 之后的点击：再负责从立方体切换到文字动效
    if (phase === 'cube') {
      setPhase('text')
    }
  }

  const handleLongPressStart = () => {
    if (!onRequestEdit) return
    longPressActive.current = true
    longPressTimer.current = setTimeout(() => {
      if (longPressActive.current) {
        onRequestEdit()
      }
    }, 3000)
  }

  const handleLongPressEnd = () => {
    longPressActive.current = false
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  return (
    <div
      className="play-full"
      onClick={handleTap}
      onMouseDown={handleLongPressStart}
      onMouseUp={handleLongPressEnd}
      onMouseLeave={handleLongPressEnd}
      onTouchStart={handleLongPressStart}
      onTouchEnd={handleLongPressEnd}
      onTouchCancel={handleLongPressEnd}
    >
      <div ref={containerRef} className="three-full" />
      {phase === 'text' && <TextRain messages={card.messages || []} />}
      <audio ref={audioRef} loop />
      {error && <div className="error play-error">{error}</div>}
    </div>
  )
}

function TextRain({ messages }) {
  const [seed] = useState(() => Math.random())

  const baseArr = useMemo(
    () => (messages && messages.length ? messages : ['在一起', '喜欢你', '永远爱你', '一直走下去']),
    [messages],
  )

  const meteorSeed = useMemo(() => seed, [seed])

  // 瀑布模式：基于固定 seed 生成随机文字雨，保证一次挂载期间稳定
  const items = useMemo(() => {
    const rows = 40
    const list = []
    let current = seed

    const nextRandom = () => {
      current = (current * 9301 + 49297) % 233280
      return current / 233280
    }

    for (let i = 0; i < rows; i++) {
      const text = baseArr[Math.floor(nextRandom() * baseArr.length)]
      list.push({
        text,
        delay: i * 90,
        offset: (nextRandom() - 0.5) * 60, // 左右更大范围
        topBase: 5 + nextRandom() * 80, // 随机起始高度
      })
    }
    return list
  }, [baseArr, seed])

  return (
    <div className="text-rain">
      <Meteors seed={meteorSeed} />
      {items.map((item, i) => (
        <div
          key={i}
          className="text-rain-line"
          style={{
            top: `${item.topBase}%`,
            animationDelay: `${item.delay}ms`,
            marginLeft: `${item.offset}%`,
          }}
        >
          {item.text}
        </div>
      ))}
    </div>
  )
}

function Meteors({ seed }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const parent = canvas.parentElement
    if (!parent) return

    // 用 seed 做一个轻量随机发生器（保证同一张卡进入文字阶段时“分布大致一致”）
    let s = Math.floor((seed || 0.5) * 1e9) + 1
    const nextRandom = () => {
      s = (s * 9301 + 49297) % 233280
      return s / 233280
    }

    let dpr = Math.min(2, window.devicePixelRatio || 1)
    let w = parent.clientWidth
    let h = parent.clientHeight
    canvas.width = Math.floor(w * dpr)
    canvas.height = Math.floor(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const meteors = []
    // 总数上限：5 条，尾巴更短更精致
    const maxMeteors = 5
    const tailPoints = 10

    const spawnMeteor = () => {
      if (meteors.length >= maxMeteors) return

      // 出生点随机，但都在“右上”较分散区域；
      // 轨迹方向统一：通过固定速度方向比（vx/vy 比例）保证斜率一致
      // 限制坐标范围，减少“散开感”，但仍避免过于集中
      const startX = w * (0.58 + nextRandom() * 0.36) // 右侧更宽：不集中
      const startY = h * (-0.22 + nextRandom() * 0.33) // 上方更宽：不贴一条线

      // 速度放慢：life 越大越慢
      const life = 1.4 + nextRandom() * 1.1 // 秒
      // 统一从“右上 -> 左下”的方向：比例保持不变 => 轨迹斜率一致
      const vx = (-0.95 * w) / life
      const vy = (1.15 * h) / life

      // 更小更细
      const thickness = 0.6 + nextRandom() * 0.8

      meteors.push({
        x: startX,
        y: startY,
        vx,
        vy,
        age: 0,
        life,
        thickness,
        trail: [],
        sparked: false,
      })
    }

    let last = performance.now()
    let spawnTimer = 0
    const resetSpawnTimer = () => {
      // 控制密度：间隔越小，条数越多
      spawnTimer = 420 + nextRandom() * 360 // ms（更慢出）
    }
    resetSpawnTimer()

    let raf = 0
    const tick = (now) => {
      const dt = Math.min(0.033, (now - last) / 1000)
      last = now

      // resize（不频繁监听，只在帧里轻量检查）
      const nw = parent.clientWidth
      const nh = parent.clientHeight
      if (nw !== w || nh !== h) {
        w = nw
        h = nh
        dpr = Math.min(2, window.devicePixelRatio || 1)
        canvas.width = Math.floor(w * dpr)
        canvas.height = Math.floor(h * dpr)
        canvas.style.width = `${w}px`
        canvas.style.height = `${h}px`
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      }

      spawnTimer -= dt * 1000
      if (spawnTimer <= 0) {
        spawnMeteor()
        // 用上限控制条数，不额外爆发生成，避免看起来“乱飞”
        resetSpawnTimer()
      }

      ctx.clearRect(0, 0, w, h)

      ctx.globalCompositeOperation = 'lighter'

      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i]
        m.age += dt
        m.x += m.vx * dt
        m.y += m.vy * dt

        m.trail.push({ x: m.x, y: m.y })
        if (m.trail.length > tailPoints) m.trail.shift()

        const p = m.age / m.life
        if (p >= 1) {
          meteors.splice(i, 1)
          continue
        }

        const headAlpha = Math.max(0, 1 - p)

        // （已移除火花）

        // 尾巴（从旧到新，逐渐变亮）
        ctx.lineCap = 'round' // B：圆头拖尾
        for (let tIdx = 1; tIdx < m.trail.length; tIdx++) {
          const p0 = m.trail[tIdx - 1]
          const p1 = m.trail[tIdx]
          const tt = tIdx / (m.trail.length - 1) // 0..1
          // B：末端更亮更“彗星感”
          const a = headAlpha * Math.pow(tt, 1.2)
          const lw = m.thickness * (0.2 + 1.2 * tt)
          ctx.lineWidth = lw
          // 尾巴从白到粉紫渐变，视觉更“能量流”
          const c1 = { r: 255, g: 255, b: 255 } // 头附近偏白
          const c2 = { r: 255, g: 140, b: 240 } // 尾巴偏粉紫
          const r = c1.r + (c2.r - c1.r) * tt
          const g = c1.g + (c2.g - c1.g) * tt
          const b = c1.b + (c2.b - c1.b) * tt
          ctx.strokeStyle = `rgba(${r.toFixed(0)},${g.toFixed(0)},${b.toFixed(0)},${a})`
          ctx.beginPath()
          ctx.moveTo(p0.x, p0.y)
          ctx.lineTo(p1.x, p1.y)
          ctx.stroke()
        }

        // A：头部径向光晕（亮点+柔边）
        const r = m.thickness * (1.0 + 1.2 * headAlpha)
        const haloR = r * 2.6
        const grad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, haloR)
        grad.addColorStop(0, `rgba(255,255,255,${0.95 * headAlpha})`)
        grad.addColorStop(0.35, `rgba(255,255,255,${0.45 * headAlpha})`)
        grad.addColorStop(1, `rgba(255,255,255,0)`)
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(m.x, m.y, haloR, 0, Math.PI * 2)
        ctx.fill()

        // 核心小点（更“聚焦”）
        ctx.fillStyle = `rgba(255,255,255,${0.9 * headAlpha})`
        ctx.beginPath()
        ctx.arc(m.x, m.y, r, 0, Math.PI * 2)
        ctx.fill()
      }

      // （已移除火花）

      ctx.globalCompositeOperation = 'source-over'
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
    }
  }, [seed])

  return (
    <div className="meteors" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  )
}

export default App
