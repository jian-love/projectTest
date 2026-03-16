import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import './App.css'

// 前端跟随当前域名，开发环境通过 Vite 代理到 3000
const API_BASE = ''

function useQuery() {
  const search = window.location.search
  const params = useMemo(() => new URLSearchParams(search), [search])
  const id = params.get('id') || 'demo001'
  const mode = params.get('edit') === '1' ? 'edit' : 'view'
  return { id, mode }
}

function App() {
  const { id, mode } = useQuery()
  const [loading, setLoading] = useState(true)
  const [card, setCard] = useState(null)
  const [error, setError] = useState('')
  const [localMode, setLocalMode] = useState(mode)

  useEffect(() => {
    async function fetchCard() {
      try {
        const res = await fetch(`${API_BASE}/api/card?id=${encodeURIComponent(id)}`)
        const data = await res.json()
        if (data.exists && data.card) {
          setCard(data.card)
        }
      } catch (e) {
        setError('加载失败，请稍后重试')
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

  if (!card || localMode === 'edit') {
    return (
      <MakerView
        id={id}
        onCreated={(newCard) => {
          setCard(newCard)
          setLocalMode('view')
          const url = new URL(window.location.href)
          url.searchParams.delete('edit')
          window.history.replaceState(null, '', url.toString())
        }}
      />
    )
  }

  return <PlayView id={id} card={card} error={error} />
}

function MakerView({ id, onCreated }) {
  const [images, setImages] = useState([])
  const [music, setMusic] = useState(null)
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
    setMusic(file)
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
    const form = new FormData()
    form.append('file', file)
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
        musicUrl = await uploadFile(music)
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

        <div className="section-title">选择背景音乐（不超过 60 秒）</div>
        <div className="upload-box">
          <label className="upload-btn">
            选择音乐
            <input type="file" accept="audio/*" onChange={handleMusicChange} />
          </label>
          <div className="pill">{music ? music.name : '未选择音乐'}</div>
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

function PlayView({ id, card, error }) {
  const [phase, setPhase] = useState('cube') // 'cube' | 'text'
  const audioRef = useRef(null)
  const containerRef = useRef(null)

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

    const loadTexture = (url) =>
      new Promise((resolve) => {
        if (!url) {
          resolve(null)
          return
        }
        loader.load(
          url,
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace
            resolve(tex)
          },
          undefined,
          () => resolve(null),
        )
      })

    let cancelled = false
    let cleanup = null

    Promise.all(faceUrls.map((u) => loadTexture(u))).then((textures) => {
      if (cancelled || !containerRef.current) return

      const width = el.clientWidth
      const height = el.clientHeight

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x000000)

      const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000)
      camera.position.set(0, 0, 9)

      const renderer = new THREE.WebGLRenderer({ antialias: true })
      renderer.setSize(width, height)
      el.innerHTML = ''
      el.appendChild(renderer.domElement)

      const light = new THREE.PointLight(0xffffff, 1.2)
      light.position.set(2, 4, 6)
      scene.add(light)
      scene.add(new THREE.AmbientLight(0xffffff, 0.4))

      const materials = textures.map((tex) => {
        const mat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
        })
        if (tex) {
          mat.map = tex
          mat.needsUpdate = true
        }
        return mat
      })

      const geometry = new THREE.BoxGeometry(2.0, 2.0, 2.0)
      const cube = new THREE.Mesh(geometry, materials)
      scene.add(cube)

      let t = 0
      let frameId
      const animate = () => {
        t += 0.005
        cube.rotation.y = t * 0.8
        cube.rotation.x = Math.sin(t * 0.6) * 0.4
        camera.position.x = Math.sin(t * 0.4) * 0.4
        camera.position.y = Math.sin(t * 0.3) * 0.25
        camera.lookAt(0, 0, 0)
        renderer.render(scene, camera)
        frameId = requestAnimationFrame(animate)
      }
      animate()

      const handleResize = () => {
        if (!containerRef.current) return
        const w = containerRef.current.clientWidth
        const h = containerRef.current.clientHeight
        camera.aspect = w / h
        camera.updateProjectionMatrix()
        renderer.setSize(w, h)
      }
      window.addEventListener('resize', handleResize)

      cleanup = () => {
        cancelAnimationFrame(frameId)
        window.removeEventListener('resize', handleResize)
        renderer.dispose()
        geometry.dispose()
        materials.forEach((m) => m.dispose())
        if (containerRef.current) {
          containerRef.current.innerHTML = ''
        }
      }

      if (cancelled && cleanup) {
        cleanup()
      }
    })

    return () => {
      cancelled = true
      if (cleanup) {
        cleanup()
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

  const handleEdit = () => {
    const origin = window.location.origin
    window.location.href = `${origin}/?id=${encodeURIComponent(
      id,
    )}&edit=1`
  }

  return (
    <div className="play-full" onClick={handleTap}>
      <div ref={containerRef} className="three-full" />
      {phase === 'text' && <TextRain messages={card.messages || []} />}
      <button
        className="edit-btn play-edit-btn"
        onClick={(e) => {
          e.stopPropagation()
          handleEdit()
        }}
      >
        返回修改
      </button>
      <audio ref={audioRef} loop />
      {error && <div className="error play-error">{error}</div>}
    </div>
  )
}

function TextRain({ messages }) {
  const baseArr =
    messages && messages.length ? messages : ['在一起', '喜欢你', '永远爱你']

  const rows = 50
  const items = []
  for (let i = 0; i < rows; i++) {
    const text = baseArr[Math.floor(Math.random() * baseArr.length)]
    items.push({
      text,
      delay: i * 80,
      offset: (Math.random() - 0.5) * 60, // 左右更大范围
      topBase: 10 + Math.random() * 70, // 随机起始高度
    })
  }

  return (
    <div className="text-rain">
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

export default App
