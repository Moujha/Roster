import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function fmtRelativeTime(isoString: string): string {
  const days = Math.floor((Date.now() - new Date(isoString).getTime()) / 86400_000)
  if (days < 1)  return 'today'
  if (days < 7)  return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}
