'use client'
import { useRouter } from 'next/navigation'

export function ReleaseButton({ contractId }: { contractId: string }) {
  const router = useRouter()
  async function handleRelease() {
    await fetch(`/api/contracts/${contractId}/release`, { method: 'POST' })
    router.refresh()
  }
  return (
    <button onClick={handleRelease} style={{
      fontFamily: 'Silkscreen, monospace', fontSize: 8, padding: '4px 10px',
      border: '1px solid var(--rose)', color: 'var(--rose)', background: 'transparent', cursor: 'pointer',
    }}>RELEASE</button>
  )
}

export function DropButton({ contractId, artistName }: { contractId: string; artistName: string }) {
  const router = useRouter()
  async function handleDrop() {
    if (!window.confirm(`Drop ${artistName}? A buyout penalty will be deducted based on remaining weeks.`)) return
    const res = await fetch(`/api/contracts/${contractId}`, { method: 'DELETE' })
    const body = await res.json()
    if (!res.ok) { alert(body.error ?? 'Drop failed'); return }
    router.refresh()
  }
  return (
    <button onClick={handleDrop} style={{
      fontFamily: 'Silkscreen, monospace', fontSize: 8, padding: '4px 10px',
      border: '1px solid var(--rose)', color: 'var(--rose)', background: 'transparent', cursor: 'pointer',
    }}>DROP</button>
  )
}
