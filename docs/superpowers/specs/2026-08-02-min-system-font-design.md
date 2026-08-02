# Design: Guarantee no app font is smaller than the system font

## Problem

Aibolit's watch UI must never render a font smaller than the system font. Today
all `text_size` values are `N * S` (base size times the system font scale). The
smallest fonts (20px, 22px) happen to be above the default system size, but
there is no structural guarantee — a future font below the system minimum would
silently violate the rule.

## Goal

Make it structurally impossible for any app font to be smaller than the system
font at the current system font-size setting. The system minimum is defined as
`getSysFontSize(16)` (sp 16 scaled by the user's global font-size setting).

## Mechanism

- Anchor the system scale factor on sp(16) instead of 100.
- Provide a `sysText(size)` helper that returns `max(size * scale, minSystemFont)`
  so any text size is clamped to at least the system minimum.
- Replace every `text_size: N * S` on the three watch pages with
  `text_size: sysText(N)`.
- Record the rule in `AGENTS.md` so future work does not violate it.

## Changes

### `src/utils/ui-scale.js`

```js
import { getSysFontSize } from '@zos/ui'

const SYS_MIN_FONT = 16

let scaleCache = null
let minCache = null

export function getSysFontScale() {
  if (scaleCache === null) {
    scaleCache = getSysFontSize(SYS_MIN_FONT) / SYS_MIN_FONT
  }
  return scaleCache
}

export function getMinSystemFontSize() {
  if (minCache === null) {
    minCache = getSysFontSize(SYS_MIN_FONT)
  }
  return minCache
}

export function sysText(size) {
  return Math.max(size * getSysFontScale(), getMinSystemFontSize())
}
```

### Pages: home, plan, snooze

In each page's render function, keep `const S = getSysFontScale()`. Replace every
`text_size: <N> * S` with `text_size: sysText(<N>)`. Vertical geometry (heights,
y advances, blocks, buttons) stays `N * S` unchanged.

### `AGENTS.md` (new, repo root)

> ## Font size rule
>
> Aibolit's watch UI must never render any font smaller than the system font.
> The minimum font size is `getSysFontSize(16)` (sp 16 scaled by the user's
> global font-size setting on the watch). Always set widget `text_size` via the
> `sysText()` helper from `src/utils/ui-scale.js` — never a raw pixel value that
> could fall below the system minimum.

## Non-goals

- No change to the ~1.7x base scale values.
- No logic, storage, data-flow, or settings changes.
- No change to the phone-side settings page.

## Verification

- `npm test` still passes (presentation-only change).
- `zeus preview` build succeeds; QR shown for manual verification.
- Manual: at any system font-size setting, every text renders at least as large
  as system text.
