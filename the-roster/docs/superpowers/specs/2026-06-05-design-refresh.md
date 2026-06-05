# Design Refresh — Dark Modern + Pixel Accents

**Date:** 2026-06-05  
**Status:** Approved

## Goal

Make the Roster UI more accessible and modern while preserving the game identity. The pixel-art aesthetic was causing real readability problems — primarily Silkscreen at 8–9px with antialiasing disabled. This refresh fixes that without abandoning the dark purple + neon accent palette that gives the app its character.

## Decisions

### Direction: Dark Modern
Keep the dark purple color palette and hard panel borders intact. Replace the pixel-retro typography with a legible, modern type system. The game feel comes from color and layout density, not from unreadable pixel fonts.

### Typography

| Role | Before | After |
|------|--------|-------|
| Logo / wordmark | Jersey 25 | Jersey 25 (keep) |
| Big stat numbers | Jersey 25 / Pixelify Sans | Jersey 25 (keep) |
| Page headings | Jersey 25 / Pixelify Sans | Jersey 25 (keep) |
| Navigation items | Silkscreen 8–10px | Inter 600, 11px |
| Section headers | Silkscreen 9–10px all-caps | Inter 700, 10px, all-caps, letter-spacing 1.5px |
| Stat labels / tags | Silkscreen 8–9px all-caps | Inter 700, 9px, all-caps, letter-spacing 1.5px |
| Body / table values | Pixelify Sans 12–14px | Inter 400–600, 12–13px |
| Tier badges | Silkscreen 8px all-caps | Inter 700, 9px, all-caps |

**Antialiasing:** restore `-webkit-font-smoothing: antialiased` (currently disabled globally with `none`). Jersey 25 renders well with antialiasing; Inter requires it.

**Fonts to load:** Inter (weights 400, 500, 600, 700, 800) — already available on Google Fonts. Jersey 25 already imported.

**Remove:** Pixelify Sans and Silkscreen imports. These are no longer used after the refresh.

### Labels and Tags

The `.tag` CSS class is used throughout for every small label. Its definition changes from:
```css
/* before */
.tag { font-family: 'Silkscreen', monospace; font-size: 9px; letter-spacing: 1px; text-transform: uppercase; }
```
to:
```css
/* after */
.tag { font-family: 'Inter', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; }
```

All-caps is retained — it preserves the structured data-terminal feel and pairs well with the Jersey 25 display numbers.

### Color Palette

Unchanged. The existing palette is strong and does not need modification:
- Backgrounds: `--bg-deep`, `--bg-panel`, `--bg-elev`, `--bg-tile`
- Lines: `--line`, `--line-soft`
- Text: `--ink-hi`, `--ink`, `--ink-mid`, `--ink-low`
- Accents: `--lime`, `--cyan`, `--amber`, `--rose`, `--violet`, `--magenta`

### Borders and Panels

Keep the 2px hard borders — they are load-bearing for the game aesthetic. No border-radius on panels.  
Tier badges gain a subtle tinted background: `rgba` of their accent color at 8% opacity (e.g. `rgba(200,255,58,0.08)` for Emerging). This improves scannability without changing the border-based color system.

### Spacing

Existing padding values are adequate. No spacing-system overhaul needed. One targeted fix: the gap between a `.tag` stat label and its Jersey 25 number below it increases from `marginTop: 4` to `marginTop: 6` to account for Inter's taller x-height.

## Scope

### In scope
- `globals.css`: font imports, `.tag` class, `.display` class, body font, antialiasing
- `src/app/(game)/layout.tsx`: sidebar nav font sizes and weights
- `src/app/(game)/dashboard/page.tsx`: inline font styles
- `src/app/(game)/search/page.tsx`: inline font styles
- `src/app/(game)/contracts/page.tsx`: inline font styles (if any)
- `src/app/(game)/history/page.tsx`: inline font styles (if any)
- `src/app/(auth)/login/page.tsx` and `signup/page.tsx`: body font
- `src/app/(game)/artist/[spotifyId]/page.tsx`: inline font styles

### Out of scope
- Color palette changes
- Layout restructuring (sidebar width, grid columns)
- New components or features
- Tailwind migration (inline styles stay inline; this is purely a font/typography pass)

## Implementation Notes

- The `fontFamily: "'Pixelify Sans', monospace"` inline style appears on nearly every page's root `<div>`. These all need updating to `fontFamily: 'Inter, sans-serif'`.
- The `fontFamily: 'Silkscreen, monospace'` inline style appears on buttons and nav items. These all need updating.
- The `.display` class uses Jersey 25 — keep as-is.
- In `globals.css`, update `--font-sans` to `'Inter', sans-serif` and remove `--font-mono` (Silkscreen).
- The root `layout.tsx` already imports Geist fonts but they aren't used in game pages. After this refresh, remove Geist imports and add Inter via `next/font/google`.

## Success Criteria

- No text smaller than 9px on screen
- All body/label text uses Inter with antialiasing
- Jersey 25 retained for logo, page titles, and large stat numbers
- Visual identity (dark purple + neon accents) unchanged
- Build passes with zero TypeScript errors
