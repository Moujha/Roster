'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function SearchBar({ initial = '' }: { initial?: string }) {
  const [q, setQ] = useState(initial)
  const router = useRouter()

  function submit() {
    const trimmed = q.trim()
    if (trimmed.length >= 2) router.push(`/search?q=${encodeURIComponent(trimmed)}`)
  }

  return (
    <input
      value={q}
      onChange={e => setQ(e.target.value)}
      onKeyDown={e => e.key === 'Enter' && submit()}
      placeholder="SEARCH ARTISTS..."
      autoFocus
      style={{
        width: '100%', background: 'var(--bg-panel)', border: '2px solid var(--lime)',
        color: 'var(--ink-hi)', fontFamily: 'Silkscreen, monospace', fontSize: 10,
        padding: '12px 16px', outline: 'none', letterSpacing: 1, display: 'block',
      }}
    />
  )
}
