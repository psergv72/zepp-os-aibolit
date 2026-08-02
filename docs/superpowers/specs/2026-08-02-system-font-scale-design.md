# Design: Apply system font-size scale to Aibolit UI

## Problem

The watch has a global "font size" setting that affects all apps (Settings →
Display → Font size). When the user increases it, other apps grow their text,
but Aibolit ignores it because all widget sizes are hardcoded raw pixel values.
The user finds the UI still too small even after the manual ~1.7x scale.

## Goal

Make the entire Aibolit watch UI scale with the system font-size setting: when
the user increases the global font size on the watch, all text AND the vertical
layout (row heights, blocks, buttons, spacing) grow proportionally, so nothing
clips and the UI matches other apps.

## Mechanism

Zepp OS exposes the system font-size preference via `getSysFontSize(size)` from
`@zos/ui` (also wrapped by ZML's `sp` metric). It returns a size after system
font scaling. At the default setting the factor is 1.0; at larger settings it is
>1.0.

The app computes one cached scale factor:

```
scale = getSysFontSize(100) / 100
```

and multiplies every **vertical** layout value and every `text_size` by it in
each page's render function.

## Scaling rules

- The screen is a fixed 480x480 design surface. `screenWidth` stays **480** —
  it is NOT multiplied.
- `text_size`: multiply by `S` (this is the point — text grows with the system
  setting).
- Vertical geometry: widget heights (`h`), `y` coordinates, `y += ...` advances,
  block heights, button heights, vertical offsets, `btnY` — multiply by `S`.
- Horizontal geometry stays anchored to the fixed screen: `x` coordinates,
  `x: 20 / x: 40 / x: screenWidth - 50`, and widths computed from
  `screenWidth` (e.g. `w: screenWidth - 60`) are left as-is. This keeps rows and
  buttons within the screen at any font size.
- Snooze buttons: `btnHeight` and vertical offsets scale; `btnWidth` and `gap`
  stay fixed so the 2-column grid always fits in 480px.

## Changes

### New file: `src/utils/ui-scale.js`

```js
import { getSysFontSize } from '@zos/ui'

let cached = null

export function getSysFontScale() {
  if (cached === null) {
    cached = getSysFontSize(100) / 100
  }
  return cached
}
```

### Home page `src/page/home/index.js`

In `renderUpcoming`:
- `const S = getSysFontScale()` at the top
- Multiply by `S`: `btnHeight`, `btnY`, every `text_size`, every widget `h`,
  every `y += ...` advance, `blockH`, checkbox `checkboxY`/`checkboxH`.
- Do NOT touch: `screenWidth`, `x` values, `w` values.

### Plan page `src/page/plan/index.js`

In `renderPlan`:
- `const S = getSysFontScale()` at the top
- Multiply by `S`: `btnHeight`, `btnY`, every `text_size`, every widget `h`,
  every `y += ...` advance, `blockH`, `medAreaH`, indicator `indicatorY`/
  `indicatorH`.
- Do NOT touch: `screenWidth`, `x` values, `w` values.

### Snooze page `src/page/snooze/index.js`

In `renderSnoozeOptions`:
- `const S = getSysFontScale()` at the top
- Multiply by `S`: initial `y`, every `text_size`, every widget `h`, every
  `y += ...` advance, `btnHeight`, the `by + Math.floor(btnHeight / 2) ± ...`
  vertical offsets.
- Do NOT touch: `screenWidth`, `btnWidth`, `gap`, `startX`, `bx` values.

## Non-goals

- No change to the manual ~1.7x base scale (it stays as the default-size baseline).
- No logic, storage, data-flow, or settings changes.
- No change to the phone-side settings page.

## Verification

- `npm test` still passes (presentation-only change).
- `zeus preview` build succeeds; QR shown for manual verification.
- Manual: with default font size the UI matches current look; with a larger
  system font size, text and vertical spacing scale up while everything stays
  within the 480px screen.
