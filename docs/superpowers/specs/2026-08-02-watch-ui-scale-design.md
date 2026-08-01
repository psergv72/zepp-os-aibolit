# Design: Increase UI scale on watch screens

## Problem

All text and UI elements on the watch pages (home, plan, snooze) are too small
for comfortable reading and tapping on the device. Font sizes range 13–22px on
a 480px-wide screen.

## Goal

Scale up text, row heights, blocks and buttons across all three watch pages by
roughly 1.7x (60–80%), rounded to convenient values. Content stays within the
screen; fewer intake rows fit per screen, which is acceptable.

## Scope

Only the three Zepp OS watch pages are changed:

- `src/page/home/index.js`
- `src/page/plan/index.js`
- `src/page/snooze/index.js`

The phone-side settings page (`src/setting/index.js`) and app-side / app-service
code are unchanged.

## Changes

### home and plan pages (shared element scale)

| Element | Was | Becomes |
|---|---|---|
| Title | 20px / h36 | 32px / h48 |
| Empty-state text | 16px | 26px |
| Intake time header | 16px / h30 | 26px / h44 |
| Medication line | 15px / h28 | 24px / h40 |
| Taken-time / restore text | 13px / h22 | 20px / h32 |
| Checkbox / checkmark | 22px | 36px |
| Bottom nav button | 16px / h36 | 26px / h48 |
| Title spacing `y += 50` | — | `y += 60` |
| Intake block height | `35 + items*30 + 10` | `48 + items*40 + 12` |
| Bottom button `btnY` | 400 | 380 |

Home page specific:

- Time header height `h: 30` -> `h: 44`, spacing `y += 35` -> `y += 44`
- Item height `h: 28` -> `h: 40`, spacing `y += 30` -> `y += 40`
- Checkbox box height calc `items*30 + 10` -> `items*40 + 12`

Plan page specific:

- Time header height `h: 30` -> `h: 44`, spacing `y += 35` -> `y += 44`
- Item height `h: 28` -> `h: 40`, spacing `y += 28` -> `y += 40`
- Taken-time line `h: 22` -> `h: 32`, spacing `y += 25` -> `y += 32`
- Restore line `h: 22` -> `h: 32`, spacing `y += 25` -> `y += 32`
- Block height `35 + items*28 + ... + 15` -> scale accordingly
- Checkbox area height `items*28 + ...` -> scale accordingly

### snooze page

| Element | Was | Becomes |
|---|---|---|
| Intake label | 18px | 28px |
| Meds text / "Отложить на:" | 14px | 22px |
| Minute number | 28px | 44px |
| "мин" caption | 14px | 22px |
| Option button size | 140x80 | 150x96 |
| Layout offsets | y=40, +45, +28, +40 | scaled (y=48, +52, +34, +48) |

## Verification

- `npm test` (existing node test runner) still passes; no logic is touched.
- Manual: screens render without overflow; text legible at 1.7x scale.

## Non-goals

- No layout redesign, no new features, no changes to logic or storage.
