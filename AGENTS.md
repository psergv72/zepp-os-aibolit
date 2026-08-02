# Aibolit

Medication reminder for Amazfit Balance 2 (Zepp OS).

## Language rules

1. Общаться с пользователем только на русском языке.
2. Все файлы `*.md`, которые я создаю, должны быть на русском языке.
3. Навыки и прочие плагины для OpenCode должны быть на русском языке.

## Font size rule

Aibolit's watch UI must never render any font smaller than the system font.
The minimum font size is `getSysFontSize(16)` (sp 16 scaled by the user's
global font-size setting on the watch). Always set widget `text_size` via the
`sysText()` helper from `src/utils/ui-scale.js` — never a raw pixel value that
could fall below the system minimum.

### Minimum font size setting (phone)

The app has a user-configurable minimum font size `minFontSize` (sp, default 16,
range 16–40) in phone settings. It is applied on top of the system font size.

Rules:

- **Font sizes**: always computed via `sysText(size)` from `src/utils/ui-scale.js`.
  `sysText()` scales the sp value by the same coefficient as elements —
  `getSysFontSize(Math.max(size * (minFontSize / 16), minFontSize))`. This makes
  fonts grow proportionally with `minFontSize` (like layout elements), while the
  rendered pixel size never falls below the configured minimum scaled by the
  watch's system font. Never use a raw pixel `text_size` or a raw sp value
  without going through `sysText()`.
- **Element/layout sizes** (heights, widths, margins, positions, button sizes):
  always scaled with the UI scale factor `getUiScale()` from
  `src/utils/ui-scale.js` — `getSysFontScale() * (minFontSize / 16)`. Use the
  `uiSize(spValue)` helper (`value * getUiScale()`) or multiply by `S =
  getUiScale()` exactly as the home/plan/snooze pages do.
- **When asked to enlarge a font or element**, express the target in sp and apply
  the coefficients above: the rendered pixel size must stay clamped to at least
  the configured minimum font and scaled by the system font. Do not hardcode
  bigger raw pixels — adjust the sp value fed to `sysText()`/`uiSize()`.
- The minimum system font floor still applies regardless of `minFontSize`:
  `minFontSize` may never be set below 16 sp (the phone UI clamps it).
