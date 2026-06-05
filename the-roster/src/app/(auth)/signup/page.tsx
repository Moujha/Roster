'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/onboarding')
      router.refresh()
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-deep)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
      fontFamily: 'Inter, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div className="display" style={{ fontSize: 42, color: 'var(--lime)', letterSpacing: 4 }}>ROSTER</div>
          <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginTop: 4 }}>THE MUSIC LABEL SIM</div>
        </div>

        <div style={{ background: 'var(--bg-panel)', border: '2px solid var(--line)', padding: 28 }}>
          <div className="tag" style={{ color: 'var(--ink-hi)', fontSize: 10, marginBottom: 20 }}>CREATE ACCOUNT</div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 6 }}>EMAIL</div>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                style={{
                  width: '100%', background: 'var(--bg-tile)', border: '1px solid var(--line)',
                  color: 'var(--ink-hi)', fontFamily: 'Pixelify Sans, monospace', fontSize: 14,
                  padding: '8px 10px', outline: 'none',
                }}
              />
            </div>
            <div>
              <div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginBottom: 6 }}>PASSWORD</div>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                style={{
                  width: '100%', background: 'var(--bg-tile)', border: '1px solid var(--line)',
                  color: 'var(--ink-hi)', fontFamily: 'Pixelify Sans, monospace', fontSize: 14,
                  padding: '8px 10px', outline: 'none',
                }}
              />
            </div>

            {error && (
              <div className="tag" style={{ color: 'var(--rose)', fontSize: 9 }}>{error}</div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 4,
                fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 10, padding: '12px',
                border: '2px solid var(--lime)', color: 'var(--lime)',
                background: 'rgba(200,255,58,0.08)', cursor: loading ? 'not-allowed' : 'pointer',
                letterSpacing: 1, opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'CREATING...' : 'CREATE ACCOUNT'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>ALREADY HAVE AN ACCOUNT? </span>
          <Link href="/login" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 10, color: 'var(--cyan)', textDecoration: 'none' }}>
            SIGN IN
          </Link>
        </div>
      </div>
    </div>
  )
}
