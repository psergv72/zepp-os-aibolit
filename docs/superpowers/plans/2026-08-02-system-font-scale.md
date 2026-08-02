# System Font Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Aibolit watch UI scale with the watch's global font-size setting via `getSysFontSize` from `@zos/ui`.

**Architecture:** A new cached helper `getSysFontScale()` returns the system font-scale factor. Each of the three watch pages multiplies its `text_size` and vertical geometry by that factor; horizontal layout stays anchored to the fixed 480px screen so nothing overflows.

**Tech Stack:** Zepp OS `@zos/ui` widget API, JavaScript (no build step for these files).

**Spec:** `docs/superpowers/specs/2026-08-02-system-font-scale-design.md`

---

## File Structure

- Create: `src/utils/ui-scale.js` — cached `getSysFontScale()` helper
- Modify: `src/page/home/index.js` — scale `renderUpcoming`
- Modify: `src/page/plan/index.js` — scale `renderPlan`
- Modify: `src/page/snooze/index.js` — scale `renderSnoozeOptions`
- Verify: `npm test` (node --test runner, `src/test/`)

Pure presentation change; no pure-logic unit to test, so verification is `npm test` plus build.

---

### Task 1: Add `getSysFontScale` helper

**Files:**
- Create: `src/utils/ui-scale.js`

- [ ] **Step 1: Create the helper file**

Create `src/utils/ui-scale.js` with exactly:

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

- [ ] **Step 2: Verify**

Run: `npm test` (from `C:\_Soft\_ZepOS\aibolit\src`)
Expected: existing tests PASS (file not yet imported anywhere).

- [ ] **Step 3: Commit**

```bash
git add src/utils/ui-scale.js
git commit -m "feat: add getSysFontScale helper"
```

---

### Task 2: Scale home page

**Files:**
- Modify: `src/page/home/index.js:62-171`

- [ ] **Step 1: Import the helper**

Add to the imports at the top of `src/page/home/index.js`:

```js
import { getSysFontScale } from '../../utils/ui-scale'
```

- [ ] **Step 2: Add scale factor at top of renderUpcoming**

At the start of `renderUpcoming(entries)`, after `let y = 20`, add:

```js
const S = getSysFontScale()
```

- [ ] **Step 3: Scale vertical values**

In `renderUpcoming`, change these to multiply by `S` (keep `screenWidth`, `x`, and `w` values unchanged):

- `const btnHeight = 48` → `48 * S`
- `const btnY = 380` → `380 * S`
- `let y = 20` → `20 * S`
- title: `text_size: 32` → `32 * S`, `h: 48` → `48 * S`
- `y += 60` → `y += 60 * S`
- empty-state: `text_size: 26` → `26 * S`, `h: 36` → `36 * S`
- `const blockH = 48 + entry.items.length * 40 + 12` → `(48 + entry.items.length * 40 + 12) * S`
- time header: `text_size: 26` → `26 * S`, `h: 44` → `44 * S`
- `y += 44` → `y += 44 * S`
- item: `text_size: 24` → `24 * S`, `h: 40` → `40 * S`
- `y += 40` → `y += 40 * S`
- `const checkboxY = y - (entry.items.length * 40) - 5` → `y - (entry.items.length * 40 + 5) * S`
- `const checkboxH = entry.items.length * 40 + 12` → `(entry.items.length * 40 + 12) * S`
- checkbox: `text_size: 36` → `36 * S`, `h: checkboxH` stays (already scaled), `w: 40` stays (horizontal)
- `y += 10` → `y += 10 * S`
- bottom button: `text_size: 26` → `26 * S`

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: existing tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/page/home/index.js
git commit -m "feat: scale home page with system font size"
```

---

### Task 3: Scale plan page

**Files:**
- Modify: `src/page/plan/index.js:72-249`

- [ ] **Step 1: Import the helper**

Add to the imports at the top of `src/page/plan/index.js`:

```js
import { getSysFontScale } from '../../utils/ui-scale'
```

- [ ] **Step 2: Add scale factor at top of renderPlan**

At the start of `renderPlan(entries)`, after `let y = 20`, add:

```js
const S = getSysFontScale()
```

- [ ] **Step 3: Scale vertical values**

In `renderPlan`, change these to multiply by `S` (keep `screenWidth`, `x`, and `w` values unchanged):

- `const btnHeight = 48` → `48 * S`
- `const btnY = 380` → `380 * S`
- `let y = 20` → `20 * S`
- title: `text_size: 32` → `32 * S`, `h: 48` → `48 * S`
- `y += 60` → `y += 60 * S`
- empty-state: `text_size: 26` → `26 * S`, `h: 36` → `36 * S`
- `const blockH = 48 + entry.items.length * 40 + (entry._takenTime ? 32 : 0) + (entry._cancelled ? 32 : 0) + 15` → `(48 + entry.items.length * 40 + (entry._takenTime ? 32 : 0) + (entry._cancelled ? 32 : 0) + 15) * S`
- time header: `text_size: 26` → `26 * S`, `h: 44` → `44 * S`
- `y += 44` → `y += 44 * S`
- item: `text_size: 24` → `24 * S`, `h: 40` → `40 * S`
- `y += 40` → `y += 40 * S`
- taken-time: `text_size: 20` → `20 * S`, `h: 32` → `32 * S`
- `y += 32` → `y += 32 * S`
- restore: `text_size: 20` → `20 * S`, `h: 32` → `32 * S`
- `y += 32` → `y += 32 * S`
- `const medAreaH = entry.items.length * 40 + (entry._takenTime ? 32 : 0)` → `(entry.items.length * 40 + (entry._takenTime ? 32 : 0)) * S`
- `const indicatorY = y - medAreaH - 5` → `y - medAreaH - 5 * S`
- `const indicatorH = medAreaH + 10` → `medAreaH + 10 * S`
- check/undo checkbox: `text_size: 36` → `36 * S`, `w: 40` stays (horizontal)
- `y += 15` → `y += 15 * S`
- bottom button: `text_size: 26` → `26 * S`

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: existing tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/page/plan/index.js
git commit -m "feat: scale plan page with system font size"
```

---

### Task 4: Scale snooze page

**Files:**
- Modify: `src/page/snooze/index.js:39-161`

- [ ] **Step 1: Import the helper**

Add to the imports at the top of `src/page/snooze/index.js`:

```js
import { getSysFontScale } from '../../utils/ui-scale'
```

- [ ] **Step 2: Add scale factor at top of renderSnoozeOptions**

At the start of `renderSnoozeOptions()`, after `let y = 48`, add:

```js
const S = getSysFontScale()
```

- [ ] **Step 3: Scale vertical values**

In `renderSnoozeOptions`, change these to multiply by `S` (keep `screenWidth`, `btnWidth`, `gap`, `startX`, and `bx` values unchanged):

- `let y = 48` → `48 * S`
- intake label: `text_size: 28` → `28 * S`, `h: 44` → `44 * S`
- `y += 52` → `y += 52 * S`
- meds text: `text_size: 22` → `22 * S`, `h: 32` → `32 * S`
- `y += 34` → `y += 34 * S`
- "Отложить на:": `text_size: 22` → `22 * S`, `h: 32` → `32 * S`
- `y += 48` → `y += 48 * S`
- `const btnHeight = 96` → `96 * S`
- minute number: `text_size: 44` → `44 * S`, `h: 48` → `48 * S`, vertical offset `by + Math.floor(btnHeight / 2) - 20` → `by + Math.floor(btnHeight / 2) - 20 * S`
- "мин" caption: `text_size: 22` → `22 * S`, `h: 28` → `28 * S`, vertical offset `by + Math.floor(btnHeight / 2) + 20` → `by + Math.floor(btnHeight / 2) + 20 * S`

Note: the invisible hit-area button `btnArea` keeps `text_size: 1` and `h: btnHeight` (already scales via btnHeight).

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: existing tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/page/snooze/index.js
git commit -m "feat: scale snooze page with system font size"
```

---

### Task 5: Final verification

**Files:**
- Verify: repository state

- [ ] **Step 1: Run full test suite**

Run: `npm test` (from `C:\_Soft\_ZepOS\aibolit\src`)
Expected: all existing tests PASS.

- [ ] **Step 2: Confirm clean working tree**

Run: `git status`
Expected: nothing left uncommitted.

- [ ] **Step 3: Build preview package**

Run: `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" preview --target ""` (target: Amazfit Balance 2)
Expected: build succeeds, QR code generated for manual verification.
