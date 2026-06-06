'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface SpotifyMatch {
  spotify_id: string
  name: string
  followers: number
}

function fmtFollowers(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M followers`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K followers`
  return `${n} followers`
}

export default function SearchBar({
  initial = '',
  activeScoutIds = [],
}: {
  initial?: string
  activeScoutIds?: string[]
}) {
  const [q, setQ] = useState(initial)
  const router = useRouter()

  const [discoverOpen, setDiscoverOpen] = useState(false)
  const [discoverQ, setDiscoverQ] = useState(initial)
  const [spotifyResults, setSpotifyResults] = useState<SpotifyMatch[] | null>(null)
  const [discovering, setDiscovering] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [discoverError, setDiscoverError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  function submit() {
    const trimmed = q.trim()
    if (trimmed.length >= 2) router.push(`/search?q=${encodeURIComponent(trimmed)}`)
  }

  async function handleDiscover() {
    setDiscovering(true); setDiscoverError('')
    const res = await fetch('/api/scouts/discover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: discoverQ }),
    })
    setDiscovering(false)
    if (!res.ok) { setDiscoverError((await res.json()).error ?? 'Search failed'); return }
    const data = await res.json()
    setSpotifyResults(data.artists)
  }

  async function handleConfirm(spotifyId: string) {
    setConfirming(true); setDiscoverError('')
    const res = await fetch('/api/scouts/discover/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spotify_id: spotifyId }),
    })
    setConfirming(false)
    if (!res.ok) { setDiscoverError((await res.json()).error ?? 'Confirm failed'); return }
    const data = await res.json()
    const weeksLeft = Math.max(1, Math.ceil(
      (new Date(data.scout.completes_at + 'T00:00:00Z').getTime() - Date.now()) / (7 * 86400_000),
    ))
    setSuccessMsg(`${data.artist.name} · ${weeksLeft} week${weeksLeft !== 1 ? 's' : ''} remaining`)
  }

  function resetDiscover() {
    setDiscoverOpen(false)
    setSpotifyResults(null)
    setDiscoverError('')
    setSuccessMsg('')
    setDiscoverQ(q)
  }

  return (
    <div>
      <input
        value={q}
        onChange={e => { setQ(e.target.value); setDiscoverQ(e.target.value) }}
        onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder="SEARCH ARTISTS..."
        autoFocus
        style={{
          width: '100%', background: 'var(--bg-panel)', border: '2px solid var(--lime)',
          color: 'var(--ink-hi)', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 13,
          padding: '12px 16px', outline: 'none', letterSpacing: 0.3, display: 'block',
        }}
      />

      {/* Request an artist — always shown */}
      <div style={{ marginTop: 16 }}>
        {successMsg ? (
          <div style={{ padding: '12px 14px', background: 'rgba(255,176,32,0.06)', border: '2px solid var(--amber)' }}>
            <div className="tag" style={{ color: 'var(--amber)', fontSize: 9, marginBottom: 6 }}>SCOUTING STARTED</div>
            <div style={{ color: 'var(--ink-hi)', fontSize: 13, marginBottom: 10 }}>{successMsg}</div>
            <button
              onClick={resetDiscover}
              style={{
                fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '6px 12px',
                border: '1px solid var(--ink-low)', color: 'var(--ink-low)', background: 'transparent', cursor: 'pointer',
              }}
            >
              SCOUT ANOTHER →
            </button>
          </div>
        ) : !discoverOpen ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--bg-panel)', border: '2px solid var(--line)' }}>
            <span style={{ color: 'var(--ink-low)', fontSize: 11 }}>Can&apos;t find who you&apos;re looking for?</span>
            <button
              onClick={() => { setDiscoverOpen(true); setDiscoverQ(q) }}
              style={{
                fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '6px 12px',
                border: '1px solid var(--amber)', color: 'var(--amber)', background: 'transparent', cursor: 'pointer',
                letterSpacing: 1,
              }}
            >
              REQUEST AN ARTIST →
            </button>
          </div>
        ) : spotifyResults === null ? (
          <div style={{ padding: '14px', background: 'var(--bg-panel)', border: '2px solid var(--amber)' }}>
            <div className="tag" style={{ color: 'var(--amber)', fontSize: 9, marginBottom: 10 }}>REQUEST AN ARTIST</div>
            <input
              value={discoverQ}
              onChange={e => setDiscoverQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && discoverQ.trim().length >= 2 && handleDiscover()}
              placeholder="ARTIST NAME..."
              style={{
                width: '100%', background: 'var(--bg-tile)', border: '1px solid var(--line)',
                color: 'var(--ink-hi)', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 12,
                padding: '8px 12px', outline: 'none', display: 'block', marginBottom: 10,
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleDiscover}
                disabled={discovering || discoverQ.trim().length < 2}
                style={{
                  flex: 2, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '8px',
                  border: '2px solid var(--amber)', color: 'var(--amber)', background: 'rgba(255,176,32,0.08)',
                  cursor: discovering || discoverQ.trim().length < 2 ? 'not-allowed' : 'pointer',
                  opacity: discovering ? 0.6 : 1,
                }}
              >
                {discovering ? 'SEARCHING...' : 'SEARCH SPOTIFY →'}
              </button>
              <button
                onClick={resetDiscover}
                style={{
                  flex: 1, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '8px',
                  border: '1px solid var(--line)', color: 'var(--ink-low)', background: 'transparent', cursor: 'pointer',
                }}
              >
                CANCEL
              </button>
            </div>
            {discoverError && (
              <div className="tag" style={{ color: 'var(--rose)', fontSize: 9, marginTop: 8 }}>{discoverError}</div>
            )}
          </div>
        ) : (
          <div style={{ padding: '14px', background: 'var(--bg-panel)', border: '2px solid var(--amber)' }}>
            <div className="tag" style={{ color: 'var(--amber)', fontSize: 9, marginBottom: 10 }}>PICK AN ARTIST</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {spotifyResults.map(r => (
                <button
                  key={r.spotify_id}
                  onClick={() => handleConfirm(r.spotify_id)}
                  disabled={confirming}
                  style={{
                    fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 12,
                    padding: '10px 14px', border: '1px solid var(--line)',
                    color: 'var(--ink-hi)', background: 'var(--bg-tile)',
                    cursor: confirming ? 'not-allowed' : 'pointer', textAlign: 'left',
                    opacity: confirming ? 0.5 : 1,
                  }}
                >
                  {r.name}
                  <span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginLeft: 8 }}>
                    {fmtFollowers(r.followers)}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={() => { setSpotifyResults(null); setDiscoverError('') }}
              style={{
                fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '6px 12px',
                border: '1px solid var(--line)', color: 'var(--ink-low)', background: 'transparent', cursor: 'pointer',
              }}
            >
              ← BACK
            </button>
            {discoverError && (
              <div className="tag" style={{ color: 'var(--rose)', fontSize: 9, marginTop: 8 }}>{discoverError}</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
