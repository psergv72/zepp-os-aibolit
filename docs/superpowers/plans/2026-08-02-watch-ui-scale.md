# Watch UI Scale Increase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scale up text sizes, row heights, blocks and buttons on the three Zepp OS watch pages by ~1.7x so the UI is readable and tappable.

**Architecture:** Pure presentation changes — no logic, storage, or data flow touched. Each watch page (`home`, `plan`, `snooze`) gets its widget layout constants scaled per the approved spec. The phone-side settings page and app-side code are untouched.

**Tech Stack:** Zepp OS `@zos/ui` widget API (JavaScript), no build step for these files.

**Spec:** `docs/superpowers/specs/2026-08-02-watch-ui-scale-design.md`

---

## File Structure

- Modify: `src/page/home/index.js` — scale home page widgets
- Modify: `src/page/plan/index.js` — scale plan page widgets
- Modify: `src/page/snooze/index.js` — scale snooze page widgets
- Verify: `npm test` (node --test runner, `src/test/`)

No new files. This is a UI-only change; there are no pure-logic units to unit-test, so verification is `npm test` (ensures nothing broke) plus manual rendering.

---

### Task 1: Scale home page UI

**Files:**
- Modify: `src/page/home/index.js:62-171`

- [ ] **Step 1: Scale title, spacing and empty state**

In `renderUpcoming`, change:
- title text `text_size: 20` → `32`, `h: 36` → `48`
- after title `y += 50` → `y += 60`
- empty-state `text_size: 16` → `26`

- [ ] **Step 2: Scale intake time header**

In `renderUpcoming`, change time header widget:
- `text_size: 16` → `26`
- `h: 30` → `44`
- `y += 35` → `y += 44`

- [ ] **Step 3: Scale medication rows**

In `renderUpcoming`, change item widget:
- `text_size: 15` → `24`
- `h: 28` → `40`
- `y += 30` → `y += 40`

- [ ] **Step 4: Scale checkbox and block height math**

In `renderUpcoming`, change:
- block height line `const blockH = 35 + entry.items.length * 30 + 10` → `48 + entry.items.length * 40 + 12`
- checkbox text `text_size: 22` → `36`
- checkbox Y calc `checkboxY = y - (entry.items.length * 30) - 5` → `y - (entry.items.length * 40) - 5`
- checkbox height `checkboxH = entry.items.length * 30 + 10` → `entry.items.length * 40 + 12`

- [ ] **Step 5: Scale bottom button**

In `renderUpcoming`, change:
- `const btnY = 400` → `380`
- `const btnHeight = 36` → `48`
- bottom button `text_size: 16` → `26`

- [ ] **Step 6: Verify**

Run: `npm test`
Expected: existing tests PASS (no logic was touched).

- [ ] **Step 7: Commit**

```bash
git add src/page/home/index.js
git commit -m "feat: scale up home page UI"
```

---

### Task 2: Scale plan page UI

**Files:**
- Modify: `src/page/plan/index.js:72-249`

- [ ] **Step 1: Scale title, spacing and empty state**

In `renderPlan`, change:
- title text `text_size: 20` → `32`, `h: 36` → `48`
- after title `y += 50` → `y += 60`
- empty-state `text_size: 16` → `26`

- [ ] **Step 2: Scale intake time header**

In `renderPlan`, change time header widget:
- `text_size: 16` → `26`
- `h: 30` → `44`
- `y += 35` → `y += 44`

- [ ] **Step 3: Scale medication rows**

In `renderPlan`, change item widget:
- `text_size: 15` → `24`
- `h: 28` → `40`
- `y += 28` → `y += 40`

- [ ] **Step 4: Scale taken-time and restore lines**

In `renderPlan`, change:
- taken-time widget `text_size: 13` → `20`, `h: 22` → `32`, `y += 25` → `y += 32`
- restore widget `text_size: 13` → `20`, `h: 22` → `32`, `y += 25` → `y += 32`
- block height line to match: `const blockH = 35 + entry.items.length * 28 + (entry._takenTime ? 25 : 0) + (entry._cancelled ? 25 : 0) + 15` → `48 + entry.items.length * 40 + (entry._takenTime ? 32 : 0) + (entry._cancelled ? 32 : 0) + 15`

- [ ] **Step 5: Scale indicator/checkbox area**

In `renderPlan`, change:
- indicator area height line `const medAreaH = entry.items.length * 28 + (entry._takenTime ? 25 : 0)` → `entry.items.length * 40 + (entry._takenTime ? 32 : 0)`
- check / undo checkbox `text_size: 22` → `36`

- [ ] **Step 6: Scale bottom button**

In `renderPlan`, change:
- `const btnY = 400` → `380`
- `const btnHeight = 36` → `48`
- bottom button `text_size: 16` → `26`

- [ ] **Step 7: Verify**

Run: `npm test`
Expected: existing tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/page/plan/index.js
git commit -m "feat: scale up plan page UI"
```

---

### Task 3: Scale snooze page UI

**Files:**
- Modify: `src/page/snooze/index.js:39-161`

- [ ] **Step 1: Scale header and labels**

In `renderSnoozeOptions`, change:
- `let y = 40` → `48`
- intake label widget `text_size: 18` → `28`, `h: 30` → `44`, `y += 45` → `y += 52`
- meds text widget `text_size: 14` → `22`, `h: 24` → `32`, `y += 28` → `y += 34`
- "Отложить на:" widget `text_size: 14` → `22`, `h: 24` → `32`, `y += 40` → `y += 48`

- [ ] **Step 2: Scale option buttons**

In `renderSnoozeOptions`, change:
- `const btnWidth = 140` → `150`
- `const btnHeight = 80` → `96`
- minute number text `text_size: 28` → `44`, `h: 40` → `48`
- minute number vertical offset: `by + Math.floor(btnHeight / 2) - 15` → `by + Math.floor(btnHeight / 2) - 20`
- "мин" caption `text_size: 14` → `22`, `h: 20` → `28`
- "мин" caption vertical offset: `by + Math.floor(btnHeight / 2) + 15` → `by + Math.floor(btnHeight / 2) + 20`

- [ ] **Step 3: Verify**

Run: `npm test`
Expected: existing tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/page/snooze/index.js
git commit -m "feat: scale up snooze page UI"
```

---

### Task 4: Final verification

**Files:**
- Verify: repository state

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: all existing tests PASS.

- [ ] **Step 2: Confirm clean working tree**

Run: `git status`
Expected: nothing left uncommitted beyond the three UI commits.
