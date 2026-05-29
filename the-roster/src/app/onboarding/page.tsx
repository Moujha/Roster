'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const GENRES = ['Afrobeats', 'Hip-Hop', 'Indie', 'Electronic', 'Pop', 'R&B / Soul', 'Latin', 'K-Pop', 'Rock']
const SEL_COLORS = ['var(--lime)', 'var(--cyan)'] as const
const SEL_BG = ['rgba(200,255,58,0.1)', 'rgba(62,224,255,0.08)'] as const

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [labelName, setLabelName] = useState('')
  const [genres, setGenres] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submitStep1() {
    if (!labelName.trim()) return
    setLoading(true); setError('')
    const res = await fetch('/api/labels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label_name: labelName.trim() }),
    })
    if (!res.ok) { setError((await res.json()).error ?? 'Error'); setLoading(false); return }
    setStep(2); setLoading(false)
  }

  async function submitStep2() {
    if (!genres.length) return
    setLoading(true)
    await fetch('/api/labels/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ genre_1: genres[0] ?? null, genre_2: genres[1] ?? null }),
    })
    setStep(3); setLoading(false)
  }

  function toggleGenre(g: string) {
    setGenres(prev => prev.includes(g) ? prev.filter(x => x !== g) : prev.length < 2 ? [...prev, g] : prev)
  }

  const btnStyle = (active: boolean): React.CSSProperties => ({
    width: '100%', fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '10px',
    border: `2px solid var(--lime)`, color: 'var(--lime)', background: 'rgba(200,255,58,0.08)',
    cursor: active ? 'pointer' : 'not-allowed', letterSpacing: 1,
    opacity: active ? 1 : 0.35,
  })

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-deep)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: "'Pixelify Sans', monospace",
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Logo + progress */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div className="display" style={{ fontSize: 42, color: 'var(--lime)', letterSpacing: 4 }}>ROSTER</div>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginTop: 4 }}>STEP {step} OF 3</div>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 8 }}>
            {[1, 2, 3].map(i => (
              <div key={i} style={{ height: 3, width: 40, background: i <= step ? 'var(--lime)' : 'var(--bg-tile)' }} />
            ))}
          </div>
        </div>

        {step === 1 && (
          <div>
            <div className="tag" style={{ color: 'var(--ink-low)', marginBottom: 8, fontSize: 9 }}>WHAT IS YOUR LABEL CALLED?</div>
            <input
              value={labelName}
              onChange={e => setLabelName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submitStep1()}
              placeholder="LABEL NAME"
              autoFocus
              style={{
                width: '100%', background: 'var(--bg-panel)', border: '2px solid var(--line)',
                color: 'var(--ink-hi)', fontFamily: 'Jersey 25, monospace', fontSize: 28,
                padding: '10px 14px', outline: 'none', letterSpacing: 2,
              }}
            />
            {error && <div className="tag" style={{ color: 'var(--rose)', fontSize: 9, marginTop: 6 }}>{error}</div>}
            <button onClick={submitStep1} disabled={!labelName.trim() || loading} style={btnStyle(!!labelName.trim() && !loading)}>
              {loading ? 'SAVING...' : 'CONTINUE'}
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="tag" style={{ color: 'var(--ink-low)', marginBottom: 4, fontSize: 9 }}>WHAT MUSIC DO YOU KNOW?</div>
            <div style={{ color: 'var(--ink-mid)', fontSize: 11, marginBottom: 12 }}>Pick 1 or 2 genres</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5, marginBottom: 12 }}>
              {GENRES.map(g => {
                const idx = genres.indexOf(g)
                const sel = idx !== -1
                return (
                  <div
                    key={g}
                    onClick={() => toggleGenre(g)}
                    style={{
                      background: sel ? SEL_BG[idx] : 'var(--bg-panel)',
                      border: `${sel ? 2 : 1}px solid ${sel ? SEL_COLORS[idx] : 'var(--line)'}`,
                      padding: '10px 6px', textAlign: 'center', cursor: 'pointer',
                    }}
                  >
                    <div className="tag" style={{ color: sel ? SEL_COLORS[idx] : 'var(--ink-mid)', fontSize: 8 }}>{g}</div>
                  </div>
                )
              })}
            </div>
            {genres.length > 0 && (
              <div style={{
                background: 'var(--bg-panel)', border: '1px solid var(--line)',
                padding: '7px 10px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>selected:</span>
                {genres.map((g, i) => (
                  <span key={g} className="tag" style={{ color: SEL_COLORS[i], border: `1px solid ${SEL_COLORS[i]}`, padding: '2px 6px', fontSize: 8 }}>{g}</span>
                ))}
              </div>
            )}
            <button onClick={submitStep2} disabled={!genres.length || loading} style={btnStyle(genres.length > 0 && !loading)}>
              {loading ? 'SAVING...' : 'CONTINUE'}
            </button>
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="tag" style={{ color: 'var(--ink-low)', marginBottom: 12, fontSize: 9 }}>YOUR FIRST SIGNING?</div>
            <div style={{ color: 'var(--ink-mid)', fontSize: 12, marginBottom: 16 }}>Head to Search to find artists and make your first offer.</div>
            <button
              onClick={() => router.push('/search')}
              style={{ ...btnStyle(true), marginBottom: 8 }}
            >
              GO TO SEARCH
            </button>
            <button
              onClick={() => router.push('/dashboard')}
              style={{
                width: '100%', fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '10px',
                border: '1px solid var(--line)', color: 'var(--ink-mid)', background: 'transparent',
                cursor: 'pointer', letterSpacing: 1,
              }}
            >
              SKIP FOR NOW
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
