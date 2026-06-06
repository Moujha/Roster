# Design Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all Silkscreen/Pixelify Sans instances with Inter + restore antialiasing, keeping Jersey 25 for display numbers and the logo, as specified in `docs/superpowers/specs/2026-06-05-design-refresh.md`.

**Architecture:** Pure typography pass — no layout changes, no new components, no Tailwind migration. Every change is a font-family, font-size, font-weight, or smoothing property. All inline styles stay inline.

**Tech Stack:** Next.js 16 (App Router), Google Fonts (Inter + Jersey 25 via CSS `@import`), Tailwind CSS 4

---

## File Map

| File | Change type |
|------|-------------|
| `src/app/globals.css` | Font import URL, `.tag` class, `body` font + smoothing, `@theme` variable |
| `src/app/layout.tsx` | Remove unused Geist/Geist_Mono imports |
| `src/app/(game)/layout.tsx` | Nav item `fontFamily`, user avatar `fontFamily` |
| `src/app/(game)/dashboard/page.tsx` | Root `fontFamily`, button `fontFamily`s, `fontSize: 8` → 9, stat `marginTop` |
| `src/app/(game)/search/page.tsx` | Root `fontFamily`, button/tag `fontFamily`s |
| `src/app/(game)/search/search-bar.tsx` | Input `fontFamily` |
| `src/app/(game)/contracts/page.tsx` | Root `fontFamily`, button/link `fontFamily`s, `fontSize: 8` → 9 |
| `src/app/(game)/contracts/actions.tsx` | Button `fontFamily`s, `fontSize: 8` → 9 |
| `src/app/(game)/history/page.tsx` | Root `fontFamily`, `fontSize: 8` → 9 |
| `src/app/(game)/artist/[spotifyId]/client.tsx` | Root `fontFamily`, all button/link `fontFamily`s |
| `src/app/(auth)/login/page.tsx` | Root `fontFamily`, button `fontFamily` |
| `src/app/(auth)/signup/page.tsx` | Root `fontFamily`, button `fontFamily` |
| `src/app/onboarding/page.tsx` | Root `fontFamily`, `btnStyle` helper, button `fontFamily`s |

---

## Task 1: globals.css — font foundation

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Replace the font import URL**

Old:
```css
@import url('https://fonts.googleapis.com/css2?family=Jersey+25&family=Pixelify+Sans:wght@400;500;700&family=Silkscreen:wght@400;700&display=swap');
```
New:
```css
@import url('https://fonts.googleapis.com/css2?family=Jersey+25&family=Inter:wght@400;500;600;700;800&display=swap');
```

- [ ] **Step 2: Update `@theme inline` block**

Old:
```css
@theme inline {
  --font-sans: 'Pixelify Sans', monospace;
  --font-mono: 'Silkscreen', monospace;
}
```
New:
```css
@theme inline {
  --font-sans: 'Inter', sans-serif;
}
```

- [ ] **Step 3: Update body font + antialiasing**

Old:
```css
body {
  background: var(--bg-deep);
  color: var(--ink);
  font-family: 'Pixelify Sans', monospace;
  -webkit-font-smoothing: none;
  font-smooth: never;
}
```
New:
```css
body {
  background: var(--bg-deep);
  color: var(--ink);
  font-family: 'Inter', sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 4: Update `.tag` class**

Old:
```css
.tag {
  font-family: 'Silkscreen', monospace;
  font-size: 9px;
  letter-spacing: 1px;
  text-transform: uppercase;
}
```
New:
```css
.tag {
  font-family: 'Inter', sans-serif;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
}
```

- [ ] **Step 5: Verify build**

```bash
cd the-roster && npm run build
```
Expected: `✓ Compiled successfully`

- [ ] **Step 6: Commit**

```bash
git add the-roster/src/app/globals.css
git commit -m "style: update globals.css — Inter replaces Pixelify/Silkscreen, restore antialiasing"
```

---

## Task 2: Root layout — remove dead Geist imports

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Replace entire file**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Roster",
  description: "Fantasy trading game powered by real Spotify data.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add the-roster/src/app/layout.tsx
git commit -m "style: remove unused Geist font imports from root layout"
```

---

## Task 3: Game sidebar layout

**Files:**
- Modify: `src/app/(game)/layout.tsx`

- [ ] **Step 1: Update SideItem link font**

In the `<Link>` style inside `SideItem`, change:
```tsx
fontSize: 12, letterSpacing: '1px',
fontFamily: 'var(--font-mono, Silkscreen)',
textTransform: 'uppercase',
```
To:
```tsx
fontSize: 11, letterSpacing: '0.5px',
fontFamily: 'Inter, sans-serif',
fontWeight: 600,
```

- [ ] **Step 2: Update user avatar font**

```tsx
// Old
fontFamily: 'Silkscreen, monospace', color: '#100719', fontSize: 14, fontWeight: 700,
```
```tsx
// New
fontFamily: 'Inter, sans-serif', color: '#100719', fontSize: 12, fontWeight: 800,
```

- [ ] **Step 3: Verify build**

```bash
cd the-roster && npm run build
```
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add "the-roster/src/app/(game)/layout.tsx"
git commit -m "style: update game sidebar to Inter"
```

---

## Task 4: Dashboard page

**Files:**
- Modify: `src/app/(game)/dashboard/page.tsx`

- [ ] **Step 1: Update root div font family**

```tsx
// Old (line 44)
<div style={{ padding: 24, color: 'var(--ink)', fontFamily: "'Pixelify Sans', monospace", maxWidth: 960 }}>
```
```tsx
// New
<div style={{ padding: 24, color: 'var(--ink)', fontFamily: 'Inter, sans-serif', maxWidth: 960 }}>
```

- [ ] **Step 2: Update SIGN ARTIST button**

```tsx
// Old
fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '8px 16px',
```
```tsx
// New
fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '8px 16px',
```

- [ ] **Step 3: Update stat value marginTop (3 locations)**

Treasury value (first stat card):
```tsx
// Old
<div className="display" style={{ fontSize: 42, color: 'var(--amber)', lineHeight: 1, marginTop: 4 }}>
```
```tsx
// New
<div className="display" style={{ fontSize: 42, color: 'var(--amber)', lineHeight: 1, marginTop: 6 }}>
```

Royalties value (second stat card):
```tsx
// Old
<div className="display" style={{ fontSize: 42, color: 'var(--lime)', lineHeight: 1, marginTop: 4 }}>
```
```tsx
// New
<div className="display" style={{ fontSize: 42, color: 'var(--lime)', lineHeight: 1, marginTop: 6 }}>
```

Roster value (third stat card):
```tsx
// Old
<div className="display" style={{ fontSize: 42, color: active.length >= 5 ? 'var(--rose)' : 'var(--cyan)', lineHeight: 1, marginTop: 4 }}>
```
```tsx
// New
<div className="display" style={{ fontSize: 42, color: active.length >= 5 ? 'var(--rose)' : 'var(--cyan)', lineHeight: 1, marginTop: 6 }}>
```

- [ ] **Step 4: Update expired banner buttons and tier badge font sizes**

Tier badge in expired banner:
```tsx
// Old
<span className="tag" style={{ color: TIER_COLORS[c.artists.tier] ?? 'var(--ink-mid)', fontSize: 8, marginLeft: 8, border: `1px solid ${TIER_COLORS[c.artists.tier] ?? 'var(--line)'}`, padding: '1px 4px' }}>
```
```tsx
// New
<span className="tag" style={{ color: TIER_COLORS[c.artists.tier] ?? 'var(--ink-mid)', fontSize: 9, marginLeft: 8, border: `1px solid ${TIER_COLORS[c.artists.tier] ?? 'var(--line)'}`, padding: '1px 4px' }}>
```

RE-SIGN link:
```tsx
// Old
fontFamily: 'Silkscreen, monospace', fontSize: 8, padding: '4px 10px',
border: '1px solid var(--lime)', color: 'var(--lime)', textDecoration: 'none',
```
```tsx
// New
fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '4px 10px',
border: '1px solid var(--lime)', color: 'var(--lime)', textDecoration: 'none',
```

RELEASE link (in expired banner):
```tsx
// Old
fontFamily: 'Silkscreen, monospace', fontSize: 8, padding: '4px 10px',
border: '1px solid var(--rose)', color: 'var(--rose)', textDecoration: 'none',
```
```tsx
// New
fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '4px 10px',
border: '1px solid var(--rose)', color: 'var(--rose)', textDecoration: 'none',
```

- [ ] **Step 5: Update active roster tier badge and SIGN FIRST ARTIST link**

Tier badge in active roster rows:
```tsx
// Old
<span className="tag" style={{
  color: TIER_COLORS[c.artists.tier] ?? 'var(--ink-mid)', fontSize: 8,
  border: `1px solid ${TIER_COLORS[c.artists.tier] ?? 'var(--line)'}`, padding: '1px 4px',
}}>{c.artists.tier.toUpperCase()}</span>
```
```tsx
// New
<span className="tag" style={{
  color: TIER_COLORS[c.artists.tier] ?? 'var(--ink-mid)', fontSize: 9,
  border: `1px solid ${TIER_COLORS[c.artists.tier] ?? 'var(--line)'}`, padding: '1px 5px',
  background: `${TIER_COLORS[c.artists.tier] ?? 'transparent'}18`,
}}>{c.artists.tier.toUpperCase()}</span>
```

SIGN YOUR FIRST ARTIST link (empty roster state):
```tsx
// Old
fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '10px 20px',
```
```tsx
// New
fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px 20px',
```

MANAGE button:
```tsx
// Old
fontFamily: 'Silkscreen, monospace', fontSize: 8, padding: '5px 10px',
border: '1px solid var(--line)', color: 'var(--ink-mid)', textDecoration: 'none',
```
```tsx
// New
fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '5px 10px',
border: '1px solid var(--line)', color: 'var(--ink-mid)', textDecoration: 'none',
```

- [ ] **Step 6: Verify build**

```bash
cd the-roster && npm run build
```
Expected: `✓ Compiled successfully`

- [ ] **Step 7: Commit**

```bash
git add "the-roster/src/app/(game)/dashboard/page.tsx"
git commit -m "style: update dashboard to Inter"
```

---

## Task 5: Search page + search bar

**Files:**
- Modify: `src/app/(game)/search/page.tsx`
- Modify: `src/app/(game)/search/search-bar.tsx`

- [ ] **Step 1: Update ArtistCard tier badge (search/page.tsx)**

```tsx
// Old
<span className="tag" style={{
  color: TIER_COLORS[artist.tier] ?? 'var(--ink-mid)', fontSize: 8,
  border: `1px solid ${TIER_COLORS[artist.tier] ?? 'var(--line)'}`, padding: '1px 4px',
}}>{artist.tier.toUpperCase()}</span>
```
```tsx
// New
<span className="tag" style={{
  color: TIER_COLORS[artist.tier] ?? 'var(--ink-mid)', fontSize: 9,
  border: `1px solid ${TIER_COLORS[artist.tier] ?? 'var(--line)'}`, padding: '1px 5px',
  background: `${TIER_COLORS[artist.tier] ?? 'transparent'}18`,
}}>{artist.tier.toUpperCase()}</span>
```

- [ ] **Step 2: Update search page root div font**

```tsx
// Old
<div style={{ padding: 24, color: 'var(--ink)', fontFamily: "'Pixelify Sans', monospace", maxWidth: 960 }}>
```
```tsx
// New
<div style={{ padding: 24, color: 'var(--ink)', fontFamily: 'Inter, sans-serif', maxWidth: 960 }}>
```

- [ ] **Step 3: Update search bar font (search-bar.tsx)**

```tsx
// Old
color: 'var(--ink-hi)', fontFamily: 'Silkscreen, monospace', fontSize: 10,
padding: '12px 16px', outline: 'none', letterSpacing: 1, display: 'block',
```
```tsx
// New
color: 'var(--ink-hi)', fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 13,
padding: '12px 16px', outline: 'none', letterSpacing: 0.3, display: 'block',
```

- [ ] **Step 4: Verify build**

```bash
cd the-roster && npm run build
```
Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add "the-roster/src/app/(game)/search/page.tsx" "the-roster/src/app/(game)/search/search-bar.tsx"
git commit -m "style: update search page to Inter"
```

---

## Task 6: Contracts page + actions

**Files:**
- Modify: `src/app/(game)/contracts/page.tsx`
- Modify: `src/app/(game)/contracts/actions.tsx`

- [ ] **Step 1: Update root div font (contracts/page.tsx)**

```tsx
// Old
<div style={{ padding: 24, color: 'var(--ink)', fontFamily: "'Pixelify Sans', monospace", maxWidth: 900 }}>
```
```tsx
// New
<div style={{ padding: 24, color: 'var(--ink)', fontFamily: 'Inter, sans-serif', maxWidth: 900 }}>
```

- [ ] **Step 2: Update tier badge and RE-SIGN link in expired section**

Tier badge:
```tsx
// Old
<span className="tag" style={{ color: tc, fontSize: 8, marginLeft: 8, border: `1px solid ${tc}`, padding: '1px 4px' }}>
```
```tsx
// New
<span className="tag" style={{ color: tc, fontSize: 9, marginLeft: 8, border: `1px solid ${tc}`, padding: '1px 5px', background: `${tc}18` }}>
```

RE-SIGN link:
```tsx
// Old
fontFamily: 'Silkscreen, monospace', fontSize: 8, padding: '5px 10px',
border: '1px solid var(--lime)', color: 'var(--lime)', textDecoration: 'none',
```
```tsx
// New
fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '5px 10px',
border: '1px solid var(--lime)', color: 'var(--lime)', textDecoration: 'none',
```

- [ ] **Step 3: Update tier badge and font sizes in active contracts**

Active contract tier badge:
```tsx
// Old
<span className="tag" style={{ color: tc, fontSize: 8, border: `1px solid ${tc}`, padding: '1px 4px' }}>{c.artists.tier.toUpperCase()}</span>
```
```tsx
// New
<span className="tag" style={{ color: tc, fontSize: 9, border: `1px solid ${tc}`, padding: '1px 5px', background: `${tc}18` }}>{c.artists.tier.toUpperCase()}</span>
```

Dates tag (next to tier badge):
```tsx
// Old
<span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8, marginLeft: 8 }}>{fmtDate(c.start_date)} - {fmtDate(c.end_date)}</span>
```
```tsx
// New
<span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9, marginLeft: 8 }}>{fmtDate(c.start_date)} - {fmtDate(c.end_date)}</span>
```

Column label tags (SIGNED, ROYALTIES, NET P&L, SPLIT / WKS — all `fontSize: 8`):
```tsx
// Old — 4 instances of fontSize: 8 on column label .tag divs
<div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>SIGNED</div>
<div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>ROYALTIES</div>
<div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>NET P&L</div>
<div className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>SPLIT / WKS</div>
```
```tsx
// New — bump all to fontSize: 9
<div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>SIGNED</div>
<div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>ROYALTIES</div>
<div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>NET P&L</div>
<div className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>SPLIT / WKS</div>
```

- [ ] **Step 4: Update contracts/actions.tsx buttons**

Both `ReleaseButton` and `DropButton`:
```tsx
// Old (both buttons)
fontFamily: 'Silkscreen, monospace', fontSize: 8, padding: '4px 10px',
```
```tsx
// New (both buttons)
fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '4px 10px',
```

- [ ] **Step 5: Verify build**

```bash
cd the-roster && npm run build
```
Expected: `✓ Compiled successfully`

- [ ] **Step 6: Commit**

```bash
git add "the-roster/src/app/(game)/contracts/page.tsx" "the-roster/src/app/(game)/contracts/actions.tsx"
git commit -m "style: update contracts page to Inter"
```

---

## Task 7: History page

**Files:**
- Modify: `src/app/(game)/history/page.tsx`

- [ ] **Step 1: Update root div font**

```tsx
// Old
<div style={{ padding: 24, color: 'var(--ink)', fontFamily: "'Pixelify Sans', monospace", maxWidth: 960 }}>
```
```tsx
// New
<div style={{ padding: 24, color: 'var(--ink)', fontFamily: 'Inter, sans-serif', maxWidth: 960 }}>
```

- [ ] **Step 2: Update all fontSize: 8 tags**

Column headers (`fontSize: 8` → `fontSize: 9`):
```tsx
// Old
{['ARTIST', 'TIER', 'COMPLETED', 'ROYALTIES', 'SIGNING COST', 'NET P&L', 'REASON'].map(h => (
  <span key={h} className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>{h}</span>
))}
```
```tsx
// New
{['ARTIST', 'TIER', 'COMPLETED', 'ROYALTIES', 'SIGNING COST', 'NET P&L', 'REASON'].map(h => (
  <span key={h} className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{h}</span>
))}
```

Tier badge in rows:
```tsx
// Old
<span className="tag" style={{ color: tc, border: `1px solid ${tc}`, padding: '1px 4px', fontSize: 8 }}>
  {h.artist_tier.toUpperCase()}
</span>
```
```tsx
// New
<span className="tag" style={{ color: tc, border: `1px solid ${tc}`, padding: '1px 5px', fontSize: 9, background: `${tc}18` }}>
  {h.artist_tier.toUpperCase()}
</span>
```

Completed date tag:
```tsx
// Old
<span className="tag" style={{ color: 'var(--ink-mid)', fontSize: 8 }}>
```
```tsx
// New
<span className="tag" style={{ color: 'var(--ink-mid)', fontSize: 9 }}>
```

Reason tag:
```tsx
// Old
<span className="tag" style={{ color: h.reason === 'dropped' ? 'var(--rose)' : 'var(--ink-mid)', fontSize: 8 }}>
```
```tsx
// New
<span className="tag" style={{ color: h.reason === 'dropped' ? 'var(--rose)' : 'var(--ink-mid)', fontSize: 9 }}>
```

- [ ] **Step 3: Verify build**

```bash
cd the-roster && npm run build
```
Expected: `✓ Compiled successfully`

- [ ] **Step 4: Commit**

```bash
git add "the-roster/src/app/(game)/history/page.tsx"
git commit -m "style: update history page to Inter"
```

---

## Task 8: Artist profile client

**Files:**
- Modify: `src/app/(game)/artist/[spotifyId]/client.tsx`

- [ ] **Step 1: Update root div and back link**

Root div:
```tsx
// Old
<div style={{ padding: 24, color: 'var(--ink)', fontFamily: "'Pixelify Sans', monospace", maxWidth: 760, position: 'relative' }}>
```
```tsx
// New
<div style={{ padding: 24, color: 'var(--ink)', fontFamily: 'Inter, sans-serif', maxWidth: 760, position: 'relative' }}>
```

Back link:
```tsx
// Old
<Link href="/search" style={{ fontFamily: 'Silkscreen, monospace', fontSize: 8, color: 'var(--ink-low)', textDecoration: 'none', marginBottom: 16, display: 'inline-block' }}>
```
```tsx
// New
<Link href="/search" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 600, fontSize: 10, color: 'var(--ink-low)', textDecoration: 'none', marginBottom: 16, display: 'inline-block' }}>
```

- [ ] **Step 2: Update artist header tier badge**

```tsx
// Old
<span className="tag" style={{ color: tierColor, border: `1px solid ${tierColor}`, padding: '2px 6px', fontSize: 9 }}>
  {artist.tier.toUpperCase()}
</span>
```
```tsx
// New
<span className="tag" style={{ color: tierColor, border: `1px solid ${tierColor}`, padding: '2px 7px', fontSize: 9, background: `${tierColor}18` }}>
  {artist.tier.toUpperCase()}
</span>
```

- [ ] **Step 3: Update MAKE AN OFFER and WATCHLIST buttons**

MAKE AN OFFER button:
```tsx
// Old
fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '10px 20px',
```
```tsx
// New
fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px 20px',
```

WATCHLIST button:
```tsx
// Old
fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '10px 16px',
```
```tsx
// New
fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px 16px',
```

- [ ] **Step 4: Update signing modal buttons and labels**

Contract term buttons (3 instances, inside `.map`):
```tsx
// Old
flex: 1, fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '8px',
```
```tsx
// New
flex: 1, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '8px',
```

CANCEL button:
```tsx
// Old
flex: 1, fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '10px',
```
```tsx
// New
flex: 1, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px',
```

CONFIRM SIGNING button:
```tsx
// Old
flex: 2, fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '10px',
```
```tsx
// New
flex: 2, fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 9, padding: '10px',
```

Deal preview row labels (`fontSize: 8`):
```tsx
// Old
<span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>{label}</span>
```
```tsx
// New
<span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>{label}</span>
```

Range label pair (10% / 50%):
```tsx
// Old
<span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>10% (artist-friendly)</span>
<span className="tag" style={{ color: 'var(--ink-low)', fontSize: 8 }}>50% (label-heavy)</span>
```
```tsx
// New
<span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>10% (artist-friendly)</span>
<span className="tag" style={{ color: 'var(--ink-low)', fontSize: 9 }}>50% (label-heavy)</span>
```

- [ ] **Step 5: Verify build**

```bash
cd the-roster && npm run build
```
Expected: `✓ Compiled successfully`

- [ ] **Step 6: Commit**

```bash
git add "the-roster/src/app/(game)/artist/[spotifyId]/client.tsx"
git commit -m "style: update artist profile to Inter"
```

---

## Task 9: Auth pages — login, signup, onboarding

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/signup/page.tsx`
- Modify: `src/app/onboarding/page.tsx`

- [ ] **Step 1: Update login page**

Root div:
```tsx
// Old
fontFamily: "'Pixelify Sans', monospace",
```
```tsx
// New
fontFamily: 'Inter, sans-serif',
```

SIGN IN button:
```tsx
// Old
fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '12px',
```
```tsx
// New
fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 10, padding: '12px',
```

SIGN IN footer link:
```tsx
// Old
<Link href="/signup" style={{ fontFamily: 'Silkscreen, monospace', fontSize: 9, color: 'var(--cyan)', textDecoration: 'none' }}>
```
```tsx
// New
<Link href="/signup" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 10, color: 'var(--cyan)', textDecoration: 'none' }}>
```

- [ ] **Step 2: Update signup page**

Root div:
```tsx
// Old
fontFamily: "'Pixelify Sans', monospace",
```
```tsx
// New
fontFamily: 'Inter, sans-serif',
```

CREATE ACCOUNT button:
```tsx
// Old
fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '12px',
```
```tsx
// New
fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 10, padding: '12px',
```

SIGN IN footer link:
```tsx
// Old
<Link href="/login" style={{ fontFamily: 'Silkscreen, monospace', fontSize: 9, color: 'var(--cyan)', textDecoration: 'none' }}>
```
```tsx
// New
<Link href="/login" style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 10, color: 'var(--cyan)', textDecoration: 'none' }}>
```

- [ ] **Step 3: Update onboarding page**

Root div:
```tsx
// Old
fontFamily: "'Pixelify Sans', monospace",
```
```tsx
// New
fontFamily: 'Inter, sans-serif',
```

`btnStyle` helper function (controls CONTINUE, GO TO SEARCH, SKIP FOR NOW buttons):
```tsx
// Old
const btnStyle = (active: boolean): React.CSSProperties => ({
  width: '100%', fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '10px',
  border: `2px solid var(--lime)`, color: 'var(--lime)', background: 'rgba(200,255,58,0.08)',
  cursor: active ? 'pointer' : 'not-allowed', letterSpacing: 1,
  opacity: active ? 1 : 0.35,
})
```
```tsx
// New
const btnStyle = (active: boolean): React.CSSProperties => ({
  width: '100%', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 10, padding: '10px',
  border: `2px solid var(--lime)`, color: 'var(--lime)', background: 'rgba(200,255,58,0.08)',
  cursor: active ? 'pointer' : 'not-allowed', letterSpacing: 1,
  opacity: active ? 1 : 0.35,
})
```

SKIP FOR NOW button:
```tsx
// Old
width: '100%', fontFamily: 'Silkscreen, monospace', fontSize: 9, padding: '10px',
```
```tsx
// New
width: '100%', fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 10, padding: '10px',
```

Genre chip tags (`fontSize: 8` → `9`):
```tsx
// Old
<div className="tag" style={{ color: sel ? SEL_COLORS[idx] : 'var(--ink-mid)', fontSize: 8 }}>{g}</div>
```
```tsx
// New
<div className="tag" style={{ color: sel ? SEL_COLORS[idx] : 'var(--ink-mid)', fontSize: 9 }}>{g}</div>
```

Selected genre badges in preview row (`fontSize: 8` → `9`):
```tsx
// Old
<span key={g} className="tag" style={{ color: SEL_COLORS[i], border: `1px solid ${SEL_COLORS[i]}`, padding: '2px 6px', fontSize: 8 }}>{g}</span>
```
```tsx
// New
<span key={g} className="tag" style={{ color: SEL_COLORS[i], border: `1px solid ${SEL_COLORS[i]}`, padding: '2px 6px', fontSize: 9 }}>{g}</span>
```

- [ ] **Step 4: Verify build**

```bash
cd the-roster && npm run build
```
Expected: `✓ Compiled successfully`

- [ ] **Step 5: Commit**

```bash
git add "the-roster/src/app/(auth)/login/page.tsx" "the-roster/src/app/(auth)/signup/page.tsx" "the-roster/src/app/onboarding/page.tsx"
git commit -m "style: update auth and onboarding pages to Inter"
```

---

## Task 10: Final push

- [ ] **Step 1: Full build check**

```bash
cd the-roster && npm run build
```
Expected: clean build, 0 TypeScript errors

- [ ] **Step 2: Push to remote**

```bash
git push
```

- [ ] **Step 3: Verify on Vercel**

After Vercel auto-deploys (triggers on push to `claude/music-fantasy-game-setup-P3eaN`): open the production URL, check login, dashboard, search, and artist profile pages. Confirm:
- All body text uses Inter (smooth, no jagged pixels)
- Logo "THE ROSTER" and big numbers still use Jersey 25
- No text below 9px visible
- All-caps labels are readable

---

## Self-Review Notes

- **Spec coverage:** All sections covered — typography table ✓, label style ✓, antialiasing ✓, tier badge backgrounds ✓, spacing adjustment ✓, all 13 files in scope ✓
- **No placeholders:** All code shown, all `fontSize: 8` instances located and replaced
- **Type consistency:** No type definitions changed; all changes are style objects (CSS properties, no TypeScript types affected)
- **Out of scope confirmed:** Color palette unchanged, no layout restructuring, no Tailwind migration
