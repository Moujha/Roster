'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const COUNTRIES: { code: string; label: string }[] = [
  { code: 'US', label: 'United States' },
  { code: 'GB', label: 'United Kingdom' },
  { code: 'FR', label: 'France' },
  { code: 'DE', label: 'Germany' },
  { code: 'JP', label: 'Japan' },
  { code: 'BR', label: 'Brazil' },
  { code: 'CA', label: 'Canada' },
  { code: 'AU', label: 'Australia' },
  { code: 'NG', label: 'Nigeria' },
  { code: 'KR', label: 'South Korea' },
  { code: 'MX', label: 'Mexico' },
  { code: 'SE', label: 'Sweden' },
]

export default function CountrySetup() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!selected) return
    setSaving(true)
    await fetch('/api/labels/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ country: selected }),
    })
    router.refresh()
  }

  if (!open) {
    return (
      <div style={{
        background: 'var(--bg-panel)', border: '1px solid var(--cyan)',
        padding: '10px 14px', marginBottom: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <span className="tag" style={{ color: 'var(--cyan)', fontSize: 9 }}>SET YOUR REGION</span>
          <span style={{ color: 'var(--ink-mid)', fontSize: 11, marginLeft: 8 }}>
            Unlock regional trending picks
          </span>
        </div>
        <button
          onClick={() => setOpen(true)}
          style={{
            fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '6px 12px',
            border: '1px solid var(--cyan)', color: 'var(--cyan)', background: 'transparent',
            cursor: 'pointer', letterSpacing: 1,
          }}
        >
          SET UP
        </button>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--cyan)',
      padding: '14px 16px', marginBottom: 16,
    }}>
      <div className="tag" style={{ color: 'var(--cyan)', fontSize: 9, marginBottom: 10 }}>WHERE IS YOUR LABEL BASED?</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, marginBottom: 12 }}>
        {COUNTRIES.map(c => {
          const sel = selected === c.code
          return (
            <div
              key={c.code}
              onClick={() => setSelected(c.code)}
              style={{
                background: sel ? 'rgba(62,224,255,0.1)' : 'var(--bg-tile)',
                border: `${sel ? 2 : 1}px solid ${sel ? 'var(--cyan)' : 'var(--line)'}`,
                padding: '7px 6px', cursor: 'pointer', textAlign: 'center',
              }}
            >
              <div className="tag" style={{ color: sel ? 'var(--cyan)' : 'var(--ink-mid)', fontSize: 9 }}>{c.code}</div>
              <div className="tag" style={{ color: sel ? 'var(--cyan)' : 'var(--ink-low)', fontSize: 8, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</div>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={save}
          disabled={!selected || saving}
          style={{
            fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '8px 16px',
            border: '2px solid var(--cyan)', color: 'var(--cyan)', background: 'rgba(62,224,255,0.08)',
            cursor: selected && !saving ? 'pointer' : 'not-allowed', letterSpacing: 1,
            opacity: selected && !saving ? 1 : 0.4,
          }}
        >
          {saving ? 'SAVING...' : 'SAVE'}
        </button>
        <button
          onClick={() => setOpen(false)}
          style={{
            fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '8px 12px',
            border: '1px solid var(--line)', color: 'var(--ink-mid)', background: 'transparent',
            cursor: 'pointer', letterSpacing: 1,
          }}
        >
          CANCEL
        </button>
      </div>
    </div>
  )
}
