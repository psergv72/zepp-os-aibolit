# Medication Reminder App for Amazfit Balance 2 (Zepp OS)

## Overview

A Zepp OS mini-program for Amazfit Balance 2 that reminds users to take medications on a customizable schedule. The app consists of a Device App (watch), Settings App (phone UI), and Side Service (phone background service).

## Device Info

- Device: Amazfit Balance 2
- API_LEVEL: 4.2
- Zepp OS: 5.0
- Screen: 480x480 round
- Physical keys: 2
- SecondaryWidget: YES

## Architecture

```
Zepp App (phone):
  Settings App (UI) <--> settingsStorage <--> Side Service
                                                |
                                              BLE/ZML
                                                |
Watch (Amazfit Balance 2):
  Device App UI <--> App Service <--> ShareLocalStorage
                    |
               @zos/alarm --> @zos/notification --> user
```

### Components

1. **Settings App** (phone) — UI for managing medications, schedules, viewing history, app settings
2. **Side Service** (phone) — background service on phone; listens to settingsStorage changes, syncs schedule to watch via BLE; receives intake records from watch and stores in settingsStorage
3. **Device App** (watch) — main UI on the watch with 3 pages + App Service for background processing
4. **App Service** (watch, background, no UI) — woken by alarm/notification, sends notifications, manages alarms, handles snooze logic, syncs data to phone

### Communication

- **Phone → Watch (schedule update)**: Settings App writes to settingsStorage → Side Service listens via `addListener('change')` → Side Service sends to Device App via `this.call()` (ZML/BLE)
- **Watch → Phone (intake records)**: App Service sends via `this.request()` (ZML/BLE) → Side Service receives via `onRequest` → stores in settingsStorage
- **Phone storage**: settingsStorage (shared between Side Service and Settings App)
- **Watch storage**: ShareLocalStorage

## Data Model

### Medication
```json
{
  "id": "uuid",
  "name": "Аспирин",
  "dosage": "100 мг",
  "comments": "После еды",
  "enabled": true
}
```

### Schedule Slot (tied to a medication)
```json
{
  "id": "uuid",
  "medicationId": "uuid",
  "time": "08:00",
  "weekDays": [1,2,3,4,5],
  "label": "Утро"
}
```
- Multiple slots per medication allowed
- `weekDays`: 1=Mon...7=Sun; `null` = every day

### Intake Record (on watch)
```json
{
  "id": "uuid",
  "medicationId": "uuid",
  "scheduleId": "uuid",
  "scheduledTime": "2026-07-29T08:00:00Z",
  "takenTime": "2026-07-29T08:05:00Z",
  "status": "taken"
}
```
Statuses: `taken`, `snoozed`, `skipped`, `cancelled`

### Cancel Record
```json
{
  "scheduleId": "uuid",
  "date": "2026-07-29"
}
```

### App Settings
```json
{
  "retryInterval": 60,
  "syncInterval": 60,
  "snoozeOptions": [30, 45, 60, 90]
}
```

## Phone UI (Settings App) — Pages

### Page 1: Medication List
- List of all medications with name, dosage, enabled/disabled status
- Add / Edit / Delete buttons
- Tap → Medication Edit page

### Page 2: Medication Edit
- Fields: name, dosage, comments, enabled toggle
- Link to Schedule Edit for this medication

### Page 3: Schedule Edit (per medication)
- Add time slot: time picker (HH:MM), day-of-week selector (checkboxes for Mon-Sun, or "every day"), optional label
- List of existing slots for this medication with edit/delete
- Validation: no duplicate (medication + time + weekDays)

### Page 4: History View
- Date picker / calendar
- List of intake records for selected date: medication name, scheduled time, taken time, status
- Ability to delete/undo a record (sends cancellation command to watch)

### Page 5: Settings
- Retry interval (minutes, number input)
- Sync interval (minutes, number input)
- Snooze options (multi-select or custom list)

## Watch UI (Device App) — Pages

### Page 1: Upcoming Intakes
- Title: "Ближайшие приёмы"
- Shows only upcoming (not past, not taken) intake slots for today
- Each slot displayed as a block:
  - Time header (e.g. ───── 14:00 ────)
  - Checkbox for the entire slot (one checkbox per slot, not per medication)
  - List of medication names under the time
- Checking the checkbox → marks ALL medications in that slot as taken at current time
- No past slots shown
- Bottom button: [Полный план →] navigates to Page 2

### Page 2: Full Day Plan
- Title: "План на [дата]"
- All slots for today, grouped by time
- Each slot block:
  - Time header with status indicator: ✓ (taken), ☐ (pending), ~~☐~~ strikethrough (cancelled)
  - List of medication names
  - If taken: shows "приняты в HH:MM"
  - If cancelled: text is strikethrough/greyed, shows "вернуть прием" link
- Interactions:
  - Tap ☐ → mark entire slot as taken → becomes ✓
  - Tap ✓ → undo (becomes ☐, re-enables reminders)
  - Long-press ☐ → context: "Отменить приём на сегодня" → becomes ~~☐~~ strikethrough
  - Tap "вернуть прием" → becomes ☐ (reminders re-enabled)
- Bottom button: [На главную]

### Page 3: Snooze Selection
- Opens when user taps "Отложить" in notification
- Title: "[medication name] [dosage]"
- Subtitle: "Отложить на:"
- 4 large buttons: 30 мин, 45 мин, 60 мин, 90 мин
- Tap → creates single-use alarm at now + selected minutes, snooze record saved

## Notification & Alarm Flow

### Alarm Creation
- On schedule update (from phone): Device App cancels all existing alarms, iterates all enabled medication slots, creates per-slot alarms via `@zos/alarm`
- Each alarm: `repeat_type: REPEAT_WEEK`, `week_days` from slot config, `url: "app-service/reminder"`, `time` = UTC timestamp for next occurrence

### Reminder Trigger
1. `@zos/alarm` fires → wakes App Service
2. App Service checks: is today's date + time slot already taken or cancelled? (reads ShareLocalStorage)
3. If already taken/cancelled → exit silently
4. If not → send `@zos/notification` with:
   - title: medication name
   - content: dosage + comments
   - vibrate: appropriate effect
   - actions: [
       { text: "Принял", file: "app-service/take", param: "scheduleId=..." },
       { text: "Отложить", file: "app-service/snooze", param: "scheduleId=..." }
     ]

### Take Action
- Notification button "Принял" → App Service is woken with param
- App Service: writes intake record to ShareLocalStorage (status: taken)
- Cancels current alarm for this slot (since it's done for today)
- Attempts to send to phone via BLE
- If BLE unavailable: marks for sync

### Snooze Action
- Notification button "Отложить" → opens Device App Page 3 (Snooze Selection)
- User selects delay → App Service creates single-use alarm (no repeat, delay = selected minutes)
- App Service writes snooze record to ShareLocalStorage

### Retry Logic
- If medication not taken and not snoozed: alarm was set to repeat, so next alarm fires per `repeat_type` interval
- Alternatively: after first notification, App Service sets a retry alarm at `retryInterval` minutes
- Retry continues until: taken, cancelled, or end of day

## Sync Strategy

### Watch → Phone
- On each intake action: attempt BLE send immediately
- If failed: queue record with timestamp
- Every `syncInterval` minutes: App Service checks queue, attempts send
- Sent records removed from queue
- Successful sync → App Service deletes records older than yesterday from ShareLocalStorage

### Phone → Watch
- On any settings change in Settings App: Side Service immediately sends full schedule to watch
- Device App receives, updates ShareLocalStorage, resets all alarms

## Storage Schema (ShareLocalStorage on Watch)

```
medications: JSON array of medication objects
schedule: JSON array of schedule slot objects
intakes: JSON array of intake records (current + yesterday)
cancellations: JSON array of { scheduleId, date }
settings: JSON app settings object
syncQueue: JSON array of intake records pending BLE send
```

## Storage Schema (settingsStorage on Phone)

```
medications: JSON string of medication array
schedule: JSON string of schedule array
settings: JSON string of app settings
history_YYYY-MM-DD: JSON string of intake records for each date
```

## Permissions (app.json)

```json
"permissions": [
  "device:os.alarm",
  "device:os.notification",
  "device:os.local_storage",
  "device:os.bg_service"
]
```
