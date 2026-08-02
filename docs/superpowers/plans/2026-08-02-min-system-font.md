# Minimum System Font Guarantee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it structurally impossible for any Aibolit watch font to render smaller than the system font (`getSysFontSize(16)`), and record the rule in `AGENTS.md`.

**Architecture:** Update `src/utils/ui-scale.js` to anchor the system scale on sp(16) and add a `sysText()` helper that clamps any text size to at least the system minimum. Replace every `text_size: N * S` on the three watch pages with `text_size: sysText(N)`. Add `AGENTS.md` with the font rule.

**Tech Stack:** Zepp OS `@zos/ui` widget API, JavaScript.

**Spec:** `docs/superpowers/specs/2026-08-02-min-system-font-design.md`

---

## File Structure

- Modify: `src/utils/ui-scale.js` — add sp(16) anchor, `getMinSystemFontSize`, `sysText`
- Modify: `src/page/home/index.js` — `text_size` → `sysText(N)`
- Modify: `src/page/plan/index.js` — `text_size` → `sysText(N)`
- Modify: `src/page/snooze/index.js` — `text_size` → `sysText(N)`
- Create: `AGENTS.md` — font rule
- Verify: `npm test` (node --test runner, `src/test/`)

---

### Task 1: Update the font-scale helper

**Files:**
- Modify: `src/utils/ui-scale.js`

- [ ] **Step 1: Replace the helper contents**

Overwrite `src/utils/ui-scale.js` with exactly:

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

- [ ] **Step 2: Verify**

Run: `npm.cmd test` (from `C:\_Soft\_ZepOS\aibolit\src`)
Expected: existing tests PASS (helper not imported by any test; page imports still work).

- [ ] **Step 3: Commit**

```bash
git add src/utils/ui-scale.js
git commit -m "feat: anchor font scale on sp(16) with sysText minimum guarantee"
```

---

### Task 2: Apply sysText on home page

**Files:**
- Modify: `src/page/home/index.js` (function `renderUpcoming`)

- [ ] **Step 1: Update the import**

In `src/page/home/index.js`, change the import line:

```js
import { getSysFontScale } from '../../utils/ui-scale'
```

to:

```js
import { getSysFontScale, sysText } from '../../utils/ui-scale'
```

- [ ] **Step 2: Replace text_size values**

In `renderUpcoming`, replace every `text_size: <N> * S` with `text_size: sysText(<N>)`:
- title: `text_size: 32 * S` → `text_size: sysText(32)`
- empty-state: `text_size: 26 * S` → `text_size: sysText(26)`
- time header: `text_size: 26 * S` → `text_size: sysText(26)`
- item: `text_size: 24 * S` → `text_size: sysText(24)`
- checkbox: `text_size: 36 * S` → `text_size: sysText(36)`
- bottom button: `text_size: 26 * S` → `text_size: sysText(26)`

Do NOT touch any vertical geometry (heights, y advances, btnY, btnHeight, blockH, checkboxY/H) — those stay `N * S`.

- [ ] **Step 3: Verify**

Run: `npm.cmd test`
Expected: existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/page/home/index.js
git commit -m "feat: use sysText on home page for min system font guarantee"
```

---

### Task 3: Apply sysText on plan page

**Files:**
- Modify: `src/page/plan/index.js` (function `renderPlan`)

- [ ] **Step 1: Update the import**

In `src/page/plan/index.js`, change the import line:

```js
import { getSysFontScale } from '../../utils/ui-scale'
```

to:

```js
import { getSysFontScale, sysText } from '../../utils/ui-scale'
```

- [ ] **Step 2: Replace text_size values**

In `renderPlan`, replace every `text_size: <N> * S` with `text_size: sysText(<N>)`:
- title: `text_size: 32 * S` → `text_size: sysText(32)`
- empty-state: `text_size: 26 * S` → `text_size: sysText(26)`
- time header: `text_size: 26 * S` → `text_size: sysText(26)`
- item: `text_size: 24 * S` → `text_size: sysText(24)`
- taken-time: `text_size: 20 * S` → `text_size: sysText(20)`
- restore: `text_size: 20 * S` → `text_size: sysText(20)`
- check/undo checkbox: `text_size: 36 * S` → `text_size: sysText(36)` (both check and undo)
- bottom button: `text_size: 26 * S` → `text_size: sysText(26)`

Do NOT touch any vertical geometry (heights, y advances, btnY, btnHeight, blockH, medAreaH, indicatorY/H) — those stay `N * S`.

- [ ] **Step 3: Verify**

Run: `npm.cmd test`
Expected: existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/page/plan/index.js
git commit -m "feat: use sysText on plan page for min system font guarantee"
```

---

### Task 4: Apply sysText on snooze page

**Files:**
- Modify: `src/page/snooze/index.js` (function `renderSnoozeOptions`)

- [ ] **Step 1: Update the import**

In `src/page/snooze/index.js`, change the import line:

```js
import { getSysFontScale } from '../../utils/ui-scale'
```

to:

```js
import { getSysFontScale, sysText } from '../../utils/ui-scale'
```

- [ ] **Step 2: Replace text_size values**

In `renderSnoozeOptions`, replace every `text_size: <N> * S` with `text_size: sysText(<N>)`:
- intake label: `text_size: 28 * S` → `text_size: sysText(28)`
- meds text: `text_size: 22 * S` → `text_size: sysText(22)`
- "Отложить на:": `text_size: 22 * S` → `text_size: sysText(22)`
- minute number: `text_size: 44 * S` → `text_size: sysText(44)`
- "мин" caption: `text_size: 22 * S` → `text_size: sysText(22)`

Do NOT touch the invisible hit-area `btnArea` (keeps `text_size: 1`). Do NOT touch any vertical geometry (heights, y, y advances, btnHeight, offsets) — those stay `N * S`.

- [ ] **Step 3: Verify**

Run: `npm.cmd test`
Expected: existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/page/snooze/index.js
git commit -m "feat: use sysText on snooze page for min system font guarantee"
```

---

### Task 5: Add font rule to AGENTS.md

**Files:**
- Create: `AGENTS.md`

- [ ] **Step 1: Create AGENTS.md**

Create `AGENTS.md` in the repo root (`C:\_Soft\_ZepOS\aibolit\AGENTS.md`) with exactly:

```markdown
# Aibolit

Medication reminder for Amazfit Balance 2 (Zepp OS).

## Font size rule

Aibolit's watch UI must never render any font smaller than the system font.
The minimum font size is `getSysFontSize(16)` (sp 16 scaled by the user's
global font-size setting on the watch). Always set widget `text_size` via the
`sysText()` helper from `src/utils/ui-scale.js` — never a raw pixel value that
could fall below the system minimum.
```

- [ ] **Step 2: Verify**

Run: `npm.cmd test` (from `C:\_Soft\_ZepOS\aibolit\src`)
Expected: existing tests PASS.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: record minimum system font rule in AGENTS.md"
```

---

### Task 6: Final verification

**Files:**
- Verify: repository state

- [ ] **Step 1: Run full test suite**

Run: `npm.cmd test` (from `C:\_Soft\_ZepOS\aibolit\src`)
Expected: all existing tests PASS.

- [ ] **Step 2: Confirm no raw text_size below guarantee remains**

Run: `rg "text_size" src/page src/utils` and review — every `text_size` on the three pages must be `sysText(<N>)`; the only exception is snooze `btnArea` `text_size: 1` (invisible hit area, correct).

- [ ] **Step 3: Confirm clean working tree**

Run: `git status`
Expected: nothing left uncommitted.

- [ ] **Step 4: Build preview package**

Run: `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" preview -t "Amazfit Balance 2"` (from `C:\_Soft\_ZepOS\aibolit\src`)
Expected: build succeeds, QR code generated for manual verification.
