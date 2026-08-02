# Aibolit

Medication reminder for Amazfit Balance 2 (Zepp OS).

## Font size rule

Aibolit's watch UI must never render any font smaller than the system font.
The minimum font size is `getSysFontSize(16)` (sp 16 scaled by the user's
global font-size setting on the watch). Always set widget `text_size` via the
`sysText()` helper from `src/utils/ui-scale.js` — never a raw pixel value that
could fall below the system minimum.
