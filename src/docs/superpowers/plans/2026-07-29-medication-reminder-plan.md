# Medication Reminder App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Zepp OS mini-program for Amazfit Balance 2 that reminds users to take medications on customizable schedules.

**Architecture:** Phone (Settings App + Side Service) stores master data and syncs to watch via BLE/ZML; Watch (Device App + App Service) manages alarms, shows notifications, records intakes, and syncs back to phone.

**Tech Stack:** Zepp OS API_LEVEL 4.2, ZML library for BLE, @zos/alarm for persistent timers, @zos/notification for alerts, ShareLocalStorage for watch storage, settingsStorage for phone storage.

---

## File Structure

```
zeppos-medication-reminder/
├── app.js                          # App entry (ZML BaseApp)
├── app.json                        # App configuration
├── package.json
├── jsconfig.json
├── global.d.ts
├── assets/
│   └── 480x480/                    # Screen assets for 480x480 round screen
├── app-side/
│   └── index.js                    # Side Service (BLE listener, sync handler)
├── page/
│   ├── home/
│   │   └── index.js                # Page 1: Upcoming intakes
│   ├── plan/
│   │   └── index.js                # Page 2: Full day plan
│   └── snooze/
│       └── index.js                # Page 3: Snooze selection
├── app-service/
│   ├── reminder.js                 # Alarm-triggered reminder App Service
│   ├── take.js                     # "Принял" action App Service
│   └── snooze-handler.js           # Snooze confirmation App Service
├── setting/
│   ├── index.js                    # Settings App (phone UI)
│   └── i18n/
│       └── ru-RU.po                # Russian locale
├── utils/
│   ├── constants.js                # Shared constants
│   ├── storage.js                  # ShareLocalStorage wrapper (watch)
│   ├── sync.js                     # BLE sync queue manager
│   └── schedule.js                 # Alarm creation/update/delete
```

---

### Task 1: Project Scaffold and Configuration

**Files:**
- Create: `app.js`
- Create: `app.json`
- Create: `package.json`
- Create: `jsconfig.json`
- Create: `global.d.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "medication-reminder",
  "version": "1.0.0",
  "description": "Medication reminder for Amazfit Balance 2",
  "main": "app.js",
  "scripts": {},
  "author": "",
  "license": "Apache-2.0",
  "devDependencies": {
    "@zeppos/device-types": "^3.0.0"
  },
  "dependencies": {
    "@zeppos/zml": "^0.0.38"
  }
}
```

- [ ] **Step 2: Create app.json**

```json
{
  "configVersion": "v3",
  "app": {
    "appType": "app",
    "version": {
      "code": 1,
      "name": "1.0.0"
    },
    "appId": 20002,
    "appName": "Aibolit",
    "icon": "icon.png",
    "vender": "your-vender",
    "description": "Medication reminder app"
  },
  "runtime": {
    "apiVersion": {
      "compatible": "4.2",
      "target": "4.2",
      "minVersion": "4.2"
    }
  },
  "targets": {
    "gt": {
      "module": {
        "page": {
          "pages": [
            "page/home/index",
            "page/plan/index",
            "page/snooze/index"
          ]
        },
        "app-side": {
          "path": "app-side/index"
        },
        "setting": {
          "path": "setting/index"
        },
        "app-service": {
          "services": [
            "app-service/reminder",
            "app-service/take",
            "app-service/snooze-handler"
          ]
        }
      },
      "platforms": [
        {
          "st": "r",
          "dw": 480
        }
      ]
    }
  },
  "permissions": [
    "device:os.alarm",
    "device:os.notification",
    "device:os.local_storage",
    "device:os.bg_service"
  ],
  "i18n": {
    "ru-RU": {
      "name": "Aibolit"
    }
  },
  "defaultLanguage": "ru-RU",
  "debug": false
}
```

- [ ] **Step 3: Create app.js**

```javascript
import { BaseApp } from '@zeppos/zml/base-app'
import { log as Logger } from '@zos/utils'

const logger = Logger.getLogger('aibolit-app')

App(
  BaseApp({
    globalData: {},
    onCreate() {
      logger.log('app onCreate invoked')
    },
    onDestroy() {
      logger.log('app onDestroy invoked')
    }
  })
)
```

- [ ] **Step 4: Create jsconfig.json**

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "es2015",
    "baseUrl": "./",
    "checkJs": false
  },
  "include": [
    "**/*.js",
    "global.d.ts"
  ],
  "exclude": [
    "node_modules"
  ]
}
```

- [ ] **Step 5: Create global.d.ts**

```typescript
/// <reference types="@zeppos/device-types/index" />
```

---

### Task 2: Shared Constants

**Files:**
- Create: `utils/constants.js`

- [ ] **Step 1: Create constants file**

```javascript
export const STORAGE_KEYS = {
  MEDICATIONS: 'medications',
  SCHEDULE: 'schedule',
  INTAKES: 'intakes',
  CANCELLATIONS: 'cancellations',
  SETTINGS: 'settings',
  SYNC_QUEUE: 'syncQueue',
}

export const INTAKE_STATUS = {
  TAKEN: 'taken',
  SNOOZED: 'snoozed',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
}

export const DEFAULT_SETTINGS = {
  retryInterval: 60,
  syncInterval: 60,
  snoozeOptions: [30, 45, 60, 90],
}

export const WEEK_DAYS = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  SUN: 7,
}

export const DAY_NAMES_RU = {
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
  7: 'Вс',
}

export const ZML_METHODS = {
  SYNC_SCHEDULE: 'sync_schedule',
  SYNC_INTAKE: 'sync_intake',
  SYNC_CANCELLATION: 'sync_cancellation',
  UNDO_INTAKE: 'undo_intake',
  RESTORE_SLOT: 'restore_slot',
}

export const ALARM_MODES = {
  REMINDER: 'reminder',
  RETRY: 'retry',
  SNOOZE: 'snooze',
}
```

---

### Task 3: Storage Utility (Watch-Side)

**Files:**
- Create: `utils/storage.js`

- [ ] **Step 1: Create storage wrapper using ShareLocalStorage**

```javascript
import { ShareLocalStorage } from '@zos/storage'
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants'

const storage = new ShareLocalStorage('aibolit-data.json')

function getItem(key, defaultValue = null) {
  const value = storage.getItem(key)
  return value !== undefined ? value : defaultValue
}

function setItem(key, value) {
  storage.setItem(key, value)
}

function removeItem(key) {
  storage.removeItem(key)
}

function clear() {
  storage.clear()
}

export function getMedications() {
  return getItem(STORAGE_KEYS.MEDICATIONS, [])
}

export function setMedications(medications) {
  setItem(STORAGE_KEYS.MEDICATIONS, medications)
}

export function getSchedule() {
  return getItem(STORAGE_KEYS.SCHEDULE, [])
}

export function setSchedule(schedule) {
  setItem(STORAGE_KEYS.SCHEDULE, schedule)
}

export function getIntakes() {
  return getItem(STORAGE_KEYS.INTAKES, [])
}

export function setIntakes(intakes) {
  setItem(STORAGE_KEYS.INTAKES, intakes)
}

export function addIntake(intake) {
  const intakes = getIntakes()
  intakes.push(intake)
  setIntakes(intakes)
  return intake
}

export function removeIntake(intakeId) {
  const intakes = getIntakes()
  const filtered = intakes.filter(i => i.id !== intakeId)
  setIntakes(filtered)
  return filtered
}

export function getCancellations() {
  return getItem(STORAGE_KEYS.CANCELLATIONS, [])
}

export function setCancellations(cancellations) {
  setItem(STORAGE_KEYS.CANCELLATIONS, cancellations)
}

export function addCancellation(scheduleId, date) {
  const cancellations = getCancellations()
  const existing = cancellations.find(c => c.scheduleId === scheduleId && c.date === date)
  if (!existing) {
    cancellations.push({ scheduleId, date })
    setCancellations(cancellations)
  }
}

export function removeCancellation(scheduleId, date) {
  const cancellations = getCancellations()
  const filtered = cancellations.filter(c => !(c.scheduleId === scheduleId && c.date === date))
  setCancellations(filtered)
}

export function isSlotCancelled(scheduleId, date) {
  const cancellations = getCancellations()
  return cancellations.some(c => c.scheduleId === scheduleId && c.date === date)
}

export function getSettings() {
  const settings = getItem(STORAGE_KEYS.SETTINGS, null)
  return settings || { ...DEFAULT_SETTINGS }
}

export function setSettings(settings) {
  setItem(STORAGE_KEYS.SETTINGS, settings)
}

export function getSyncQueue() {
  return getItem(STORAGE_KEYS.SYNC_QUEUE, [])
}

export function setSyncQueue(queue) {
  setItem(STORAGE_KEYS.SYNC_QUEUE, queue)
}

export function addToSyncQueue(record) {
  const queue = getSyncQueue()
  queue.push(record)
  setSyncQueue(queue)
}

export function clearSyncedItems(syncedIds) {
  const queue = getSyncQueue()
  const remaining = queue.filter(item => !syncedIds.includes(item.id))
  setSyncQueue(remaining)
}

export function getTodayDateStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function getYesterdayDateStr() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function pruneOldIntakes() {
  const today = getTodayDateStr()
  const yesterday = getYesterdayDateStr()
  const intakes = getIntakes()
  const filtered = intakes.filter(i => i.date === today || i.date === yesterday)
  setIntakes(filtered)
}

export function clearAll() {
  clear()
}
```

---

### Task 4: Schedule/Alarm Management Utility

**Files:**
- Create: `utils/schedule.js`

- [ ] **Step 1: Create schedule utility**

```javascript
import { set as setAlarm, cancel as cancelAlarm, getAllAlarms, REPEAT_WEEK, REPEAT_ONCE } from '@zos/alarm'
import { log as Logger } from '@zos/utils'
import { ALARM_MODES } from './constants'
import { getMedications, getSchedule, getSettings, getIntakes, getCancellations, getTodayDateStr, isSlotCancelled } from './storage'

const logger = Logger.getLogger('aibolit-schedule')

function getNextAlarmTime(hours, minutes) {
  const now = new Date()
  const target = new Date(now)
  target.setHours(hours, minutes, 0, 0)
  if (target <= now) {
    target.setDate(target.getDate() + 1)
  }
  return Math.floor(target.getTime() / 1000)
}

function getUTCSeconds(hours, minutes) {
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0)
  return Math.floor(target.getTime() / 1000)
}

function getCurrentDayUTC() {
  const now = new Date()
  return Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000)
}

export function getWeekDayBit(dayOfWeek) {
  const bits = { 0: 0, 1: 1, 2: 2, 3: 4, 4: 8, 5: 16, 6: 32, 7: 64 }
  return bits[dayOfWeek] || 0
}

export function getWeekDaysBitmask(weekDays) {
  if (!weekDays || weekDays.length === 0) return 127
  let mask = 0
  for (const day of weekDays) {
    mask |= getWeekDayBit(day)
  }
  return mask
}

export function createSlotAlarm(slot, medication) {
  const [hours, minutes] = slot.time.split(':').map(Number)
  const utcTime = getUTCSeconds(hours, minutes)
  const weekDaysMask = getWeekDaysBitmask(slot.weekDays)
  const param = JSON.stringify({
    mode: ALARM_MODES.REMINDER,
    slotId: slot.id,
    medicationId: slot.medicationId,
    medicationName: medication.name,
    dosage: medication.dosage,
  })

  const option = {
    url: 'app-service/reminder',
    time: utcTime,
    repeat_type: REPEAT_WEEK,
    week_days: weekDaysMask,
    param: param,
    store: true,
  }

  const id = setAlarm(option)
  logger.log(`Created alarm id=${id} for slot ${slot.id} at ${slot.time}`)
  return id
}

export function createRetryAlarm(slotId, medicationId, medicationName, dosage, delayMinutes) {
  const delaySeconds = delayMinutes * 60
  const param = JSON.stringify({
    mode: ALARM_MODES.RETRY,
    slotId: slotId,
    medicationId: medicationId,
    medicationName: medicationName,
    dosage: dosage,
  })

  const option = {
    url: 'app-service/reminder',
    delay: delaySeconds,
    repeat_type: REPEAT_ONCE,
    param: param,
    store: false,
  }

  const id = setAlarm(option)
  logger.log(`Created retry alarm id=${id} for slot ${slotId} in ${delayMinutes}min`)
  return id
}

export function createSnoozeAlarm(slotId, medicationId, medicationName, dosage, delayMinutes) {
  const delaySeconds = delayMinutes * 60
  const param = JSON.stringify({
    mode: ALARM_MODES.SNOOZE,
    slotId: slotId,
    medicationId: medicationId,
    medicationName: medicationName,
    dosage: dosage,
  })

  const option = {
    url: 'app-service/reminder',
    delay: delaySeconds,
    repeat_type: REPEAT_ONCE,
    param: param,
    store: false,
  }

  const id = setAlarm(option)
  logger.log(`Created snooze alarm id=${id} for slot ${slotId} in ${delayMinutes}min`)
  return id
}

export function refreshAlarms() {
  const medications = getMedications()
  const schedule = getSchedule()
  const todayDateStr = getTodayDateStr()
  const settings = getSettings()
  const dayOfWeek = new Date().getDay() === 0 ? 7 : new Date().getDay()

  const allAlarms = getAllAlarms()
  for (const alarm of allAlarms) {
    cancelAlarm(alarm.id)
  }

  for (const slot of schedule) {
    const medication = medications.find(m => m.id === slot.medicationId)
    if (!medication || !medication.enabled) continue

    if (slot.weekDays && slot.weekDays.length > 0 && !slot.weekDays.includes(dayOfWeek)) continue

    if (isSlotCancelled(slot.id, todayDateStr)) continue

    const todayIntakes = getIntakes().filter(i => i.scheduleId === slot.id && i.date === todayDateStr)
    const isTaken = todayIntakes.some(i => i.status === 'taken')
    if (isTaken) continue

    createSlotAlarm(slot, medication)
  }

  logger.log('Alarms refreshed')
}

export function cancelAlarmById(alarmId) {
  cancelAlarm(alarmId)
}
```

---

### Task 5: Sync Utility (BLE)

**Files:**
- Create: `utils/sync.js`

- [ ] **Step 1: Create sync utility**

```javascript
import { log as Logger } from '@zos/utils'
import { ZML_METHODS } from './constants'
import { getSyncQueue, addToSyncQueue, clearSyncedItems, getTodayDateStr, getYesterdayDateStr, pruneOldIntakes } from './storage'

const logger = Logger.getLogger('aibolit-sync')

let sideService = null

export function initSync(zmlSideService) {
  sideService = zmlSideService
  logger.log('Sync module initialized')
}

export function sendIntakeToPhone(intake) {
  addToSyncQueue(intake)
  trySyncNow()
}

function trySyncNow() {
  if (!sideService) return

  const queue = getSyncQueue()
  if (queue.length === 0) return

  const payload = {
    method: ZML_METHODS.SYNC_INTAKE,
    params: {
      records: queue,
    },
  }

  try {
    sideService.call(payload)
    const ids = queue.map(item => item.id)
    clearSyncedItems(ids)
    pruneOldIntakes()
    logger.log(`Synced ${ids.length} records to phone`)
  } catch (error) {
    logger.log(`Sync failed: ${error}, will retry later`)
  }
}

export function sendCancellationToPhone(scheduleId, date) {
  if (!sideService) return

  const payload = {
    method: ZML_METHODS.SYNC_CANCELLATION,
    params: {
      scheduleId,
      date,
    },
  }

  try {
    sideService.call(payload)
    logger.log(`Cancellation synced for ${scheduleId} on ${date}`)
  } catch (error) {
    logger.log(`Cancellation sync failed: ${error}`)
  }
}

export function retrySync() {
  trySyncNow()
}
```

---

### Task 6: Side Service (Phone Background Service)

**Files:**
- Create: `app-side/index.js`

- [ ] **Step 1: Create Side Service**

```javascript
import { BaseSideService } from '@zeppos/zml/base-side'
import { log as Logger } from '@zos/utils'
import { ZML_METHODS } from '../utils/constants'

const logger = Logger.getLogger('aibolit-side')

AppSideService(
  BaseSideService({
    onInit() {
      logger.log('Side Service onInit')
    },

    onRun() {
      logger.log('Side Service onRun')
    },

    onDestroy() {
      logger.log('Side Service onDestroy')
    },

    onRequest(req, res) {
      logger.log(`onRequest method: ${req.method}`)

      if (req.method === ZML_METHODS.SYNC_INTAKE) {
        const { records } = req.params
        if (records && records.length > 0) {
          for (const record of records) {
            const dateKey = `history_${record.date}`
            const existing = settings.settingsStorage.getItem(dateKey)
            const history = existing ? JSON.parse(existing) : []
            history.push(record)
            settings.settingsStorage.setItem(dateKey, JSON.stringify(history))
          }
          res(null, { success: true, count: records.length })
        } else {
          res(null, { success: true, count: 0 })
        }
        return
      }

      if (req.method === ZML_METHODS.SYNC_CANCELLATION) {
        const { scheduleId, date } = req.params
        const dateKey = `history_${date}`
        const existing = settings.settingsStorage.getItem(dateKey)
        const history = existing ? JSON.parse(existing) : []
        history.push({
          scheduleId,
          date,
          status: 'cancelled',
          syncedAt: new Date().toISOString(),
        })
        settings.settingsStorage.setItem(dateKey, JSON.stringify(history))
        res(null, { success: true })
        return
      }

      res('unknown method', null)
    },

    onCall(data) {
      logger.log(`onCall method: ${data.method}`)
    },
  })
)
```

---

### Task 7: Settings App (Phone UI) — Page Structure

**Files:**
- Create: `setting/index.js`
- Create: `setting/i18n/ru-RU.po`

- [ ] **Step 1: Create Russian locale**

```
msgid ""
msgstr ""
"Language: ru\n"
"Content-Type: text/plain; charset=UTF-8\n"

msgid "medication_list"
msgstr "Лекарства"

msgid "add_medication"
msgstr "Добавить лекарство"

msgid "edit_medication"
msgstr "Редактировать лекарство"

msgid "medication_name"
msgstr "Название"

msgid "dosage"
msgstr "Дозировка"

msgid "comments"
msgstr "Комментарии"

msgid "enabled"
msgstr "Активно"

msgid "schedule"
msgstr "Расписание"

msgid "add_slot"
msgstr "Добавить время"

msgid "time"
msgstr "Время"

msgid "weekdays"
msgstr "Дни недели"

msgid "every_day"
msgstr "Каждый день"

msgid "label"
msgstr "Метка"

msgid "history"
msgstr "История"

msgid "settings"
msgstr "Настройки"

msgid "retry_interval"
msgstr "Интервал повтора (мин)"

msgid "sync_interval"
msgstr "Интервал синхронизации (мин)"

msgid "snooze_options"
msgstr "Варианты отложки (мин)"

msgid "save"
msgstr "Сохранить"

msgid "delete"
msgstr "Удалить"

msgid "cancel"
msgstr "Отмена"

msgid "taken"
msgstr "Принято"

msgid "cancelled"
msgstr "Отменено"

msgid "no_data"
msgstr "Нет данных"
```

- [ ] **Step 2: Create Settings App main file**

This is a complex file. The Settings App in Zepp OS uses a reactive build() function that renders UI components.

```javascript
import { log as Logger } from '@zos/utils'

const logger = Logger.getLogger('aibolit-setting')

const STORAGE_KEYS = {
  medications: 'medications',
  schedule: 'schedule',
  settings: 'settings',
}

function getItem(key, defaultValue) {
  const val = settings.settingsStorage.getItem(key)
  return val !== null && val !== undefined ? JSON.parse(val) : defaultValue
}

function setItem(key, value) {
  settings.settingsStorage.setItem(key, JSON.stringify(value))
}

function getMedications() {
  return getItem(STORAGE_KEYS.medications, [])
}

function setMedications(meds) {
  setItem(STORAGE_KEYS.medications, meds)
}

function getSchedule() {
  return getItem(STORAGE_KEYS.schedule, [])
}

function setSchedule(sched) {
  setItem(STORAGE_KEYS.schedule, sched)
}

function getAppSettings() {
  return getItem(STORAGE_KEYS.settings, { retryInterval: 60, syncInterval: 60, snoozeOptions: [30, 45, 60, 90] })
}

function setAppSettings(s) {
  setItem(STORAGE_KEYS.settings, s)
}

let currentPage = 'list'
let editingMedication = null
let editingSlot = null
let selectedDate = null
let viewHistoryDate = null

function getHistoryForDate(dateStr) {
  const data = settings.settingsStorage.getItem(`history_${dateStr}`)
  return data ? JSON.parse(data) : []
}

function navigateTo(page, params) {
  currentPage = page
  if (params) {
    if (params.medication) editingMedication = params.medication
    if params.slot editingSlot = params.slot
    if (params.date) viewHistoryDate = params.date
  }
  build()
}

function build() {
  switch (currentPage) {
    case 'list': renderMedicationList(); break
    case 'edit': renderMedicationEdit(); break
    case 'schedule': renderScheduleList(); break
    case 'slotEdit': renderSlotEdit(); break
    case 'history': renderHistory(); break
    case 'settings': renderSettingsPage(); break
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// ── Medication List Page ──

function renderMedicationList() {
  const medications = getMedications()
  const schedule = getSchedule()

  const items = medications.map(med => {
    const slotCount = schedule.filter(s => s.medicationId === med.id).length
    return {
      name: med.name,
      dosage: med.dosage,
      enabled: med.enabled,
      slotCount,
      onTap: () => navigateTo('edit', { medication: med }),
    }
  })

  const plusButton = {
    text: '+',
    onTap: () => navigateTo('edit', { medication: null }),
  }

  const historyButton = {
    text: getText('history'),
    onTap: () => navigateTo('history'),
  }

  const settingsButton = {
    text: getText('settings'),
    onTap: () => navigateTo('settings'),
  }

  renderList(items, plusButton, historyButton, settingsButton)
}

function renderList(items, plusButton, historyButton, settingsButton) {
  const container = createContainer()
  container.addTitle(getText('medication_list'))

  for (const item of items) {
    container.addRow({
      text: `${item.name} (${item.dosage})${!item.enabled ? ' [OFF]' : ''}`,
      subtext: `${item.slotCount} приемов`,
      onClick: item.onTap,
    })
  }

  container.addButton(plusButton)
  container.addButton(historyButton)
  container.addButton(settingsButton)
}

// ── Medication Edit Page ──

function renderMedicationEdit() {
  const isNew = !editingMedication
  const med = isNew ? { name: '', dosage: '', comments: '', enabled: true } : { ...editingMedication }

  const nameInput = createInput(getText('medication_name'), med.name, val => med.name = val)
  const dosageInput = createInput(getText('dosage'), med.dosage, val => med.dosage = val)
  const commentsInput = createInput(getText('comments'), med.comments, val => med.comments = val)
  const enabledToggle = createToggle(getText('enabled'), med.enabled, val => med.enabled = val)

  const saveButton = {
    text: getText('save'),
    onTap: () => {
      if (!med.name.trim()) return
      const medications = getMedications()
      if (isNew) {
        med.id = generateId()
        medications.push(med)
      } else {
        const idx = medications.findIndex(m => m.id === med.id)
        if (idx >= 0) medications[idx] = med
      }
      setMedications(medications)
      if (!isNew && med.id) {
        const schedule = getSchedule()
        if (!med.enabled) {
          const updated = schedule.filter(s => s.medicationId !== med.id)
          setSchedule(updated)
        }
      }
      editingMedication = null
      navigateTo('list')
    },
  }

  const scheduleButton = {
    text: getText('schedule'),
    onTap: () => {
      const tempMed = editingMedication || { name: med.name, dosage: med.dosage }
      navigateTo('schedule', { medication: isNew ? null : editingMedication })
    },
  }

  const backButton = {
    text: getText('cancel'),
    onTap: () => {
      editingMedication = null
      navigateTo('list')
    },
  }

  renderForm([nameInput, dosageInput, commentsInput, enabledToggle], [saveButton, scheduleButton, backButton])
}

// ── Schedule List Page ──

function renderScheduleList() {
  const schedule = getSchedule()
  const medicationId = editingMedication ? editingMedication.id : null
  const slots = schedule.filter(s => s.medicationId === medicationId)

  const items = slots.map(slot => ({
    label: slot.label || slot.time,
    time: slot.time,
    weekDays: slot.weekDays && slot.weekDays.length ? slot.weekDays.map(d => DAY_SHORT[d]).join(',') : 'Каждый день',
    onTap: () => navigateTo('slotEdit', { slot }),
  }))

  const addButton = {
    text: getText('add_slot'),
    onTap: () => navigateTo('slotEdit', { slot: null }),
  }

  const backButton = {
    text: getText('cancel'),
    onTap: () => navigateTo('edit', { medication: editingMedication }),
  }

  renderList(items, addButton, backButton)
}

const DAY_SHORT = { 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Вс' }

// ── Slot Edit Page ──

function renderSlotEdit() {
  const isNew = !editingSlot
  const slot = isNew ? { medicationId: editingMedication ? editingMedication.id : null, time: '08:00', weekDays: null, label: '' } : { ...editingSlot }

  const timeInput = createInput(getText('time'), slot.time, val => slot.time = val)
  const labelInput = createInput(getText('label'), slot.label, val => slot.label = val)

  const allDaysToggle = createToggle(getText('every_day'), !slot.weekDays || slot.weekDays.length === 0, val => {
    slot.weekDays = val ? null : []
  })

  const saveButton = {
    text: getText('save'),
    onTap: () => {
      if (!slot.time) return
      if (!slot.medicationId) return
      const schedule = getSchedule()
      if (isNew) {
        slot.id = generateId()
        schedule.push(slot)
      } else {
        const idx = schedule.findIndex(s => s.id === slot.id)
        if (idx >= 0) schedule[idx] = slot
      }
      setSchedule(schedule)
      editingSlot = null
      navigateTo('schedule', { medication: editingMedication })
    },
  }

  const deleteButton = isNew ? null : {
    text: getText('delete'),
    onTap: () => {
      if (!slot.id) return
      const schedule = getSchedule()
      const filtered = schedule.filter(s => s.id !== slot.id)
      setSchedule(filtered)
      editingSlot = null
      navigateTo('schedule', { medication: editingMedication })
    },
  }

  const backButton = {
    text: getText('cancel'),
    onTap: () => {
      editingSlot = null
      navigateTo('schedule', { medication: editingMedication })
    },
  }

  const buttons = [saveButton]
  if (deleteButton) buttons.push(deleteButton)
  buttons.push(backButton)
  renderForm([timeInput, allDaysToggle, labelInput], buttons)
}

// ── History Page ──

function renderHistory() {
  const today = new Date()
  const dateStr = viewHistoryDate || `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const records = getHistoryForDate(dateStr)
  const medications = getMedications()

  const dateInput = createInput('Дата (ГГГГ-ММ-ДД)', dateStr, val => {
    viewHistoryDate = val
    navigateTo('history')
  })

  const items = records.map(rec => {
    const med = medications.find(m => m.id === rec.medicationId)
    const medName = med ? med.name : rec.medicationId
    return {
      text: `${medName}`,
      subtext: rec.status === 'taken' ? `${getText('taken')} в ${rec.takenTime || rec.scheduledTime}` : getText('cancelled'),
    }
  })

  const backButton = {
    text: getText('cancel'),
    onTap: () => {
      viewHistoryDate = null
      navigateTo('list')
    },
  }

  renderForm([dateInput], [backButton])
}

// ── Settings Page ──

function renderSettingsPage() {
  const appSettings = getAppSettings()

  const retryInput = createInput(getText('retry_interval'), String(appSettings.retryInterval), val => {
    appSettings.retryInterval = parseInt(val, 10) || 60
  })

  const syncInput = createInput(getText('sync_interval'), String(appSettings.syncInterval), val => {
    appSettings.syncInterval = parseInt(val, 10) || 60
  })

  const snoozeInput = createInput(getText('snooze_options'), appSettings.snoozeOptions.join(', '), val => {
    appSettings.snoozeOptions = val.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n))
  })

  const saveButton = {
    text: getText('save'),
    onTap: () => {
      setAppSettings(appSettings)
      navigateTo('list')
    },
  }

  const backButton = {
    text: getText('cancel'),
    onTap: () => navigateTo('list'),
  }

  renderForm([retryInput, syncInput, snoozeInput], [saveButton, backButton])
}

// ── UI Helpers ──

function createContainer() {
  return {
    items: [],
    addTitle(text) {
      this.items.push({ type: 'title', text })
    },
    addRow({ text, subtext, onClick }) {
      this.items.push({ type: 'row', text, subtext, onClick })
    },
    addButton(btn) {
      this.items.push({ type: 'button', ...btn })
    },
  }
}

function createInput(label, value, onChange) {
  return { type: 'input', label, value, onChange }
}

function createToggle(label, value, onChange) {
  return { type: 'toggle', label, value, onChange }
}

function renderForm(fields, buttons) {
  const container = document.createElement('div')

  for (const field of fields) {
    if (field.type === 'input') {
      const label = document.createElement('label')
      label.textContent = field.label
      const input = document.createElement('input')
      input.value = field.value
      input.addEventListener('input', e => field.onChange(e.target.value))
      container.appendChild(label)
      container.appendChild(input)
    } else if (field.type === 'toggle') {
      const label = document.createElement('label')
      label.textContent = field.label
      const toggle = document.createElement('input')
      toggle.type = 'checkbox'
      toggle.checked = field.value
      toggle.addEventListener('change', e => field.onChange(e.target.checked))
      container.appendChild(label)
      container.appendChild(toggle)
    }
  }

  for (const btn of buttons) {
    const button = document.createElement('button')
    button.textContent = btn.text
    button.addEventListener('click', btn.onTap)
    container.appendChild(button)
  }

  document.body.innerHTML = ''
  document.body.appendChild(container)
}

function renderList(items, ...extraButtons) {
  const container = document.createElement('div')

  for (const item of items) {
    const row = document.createElement('div')
    row.className = 'list-item'
    const nameEl = document.createElement('span')
    nameEl.textContent = item.text
    row.appendChild(nameEl)
    if (item.subtext) {
      const subEl = document.createElement('small')
      subEl.textContent = item.subtext
      row.appendChild(subEl)
    }
    if (item.onTap) {
      row.addEventListener('click', item.onTap)
    }
    container.appendChild(row)
  }

  for (const btn of extraButtons) {
    const button = document.createElement('button')
    button.textContent = btn.text
    button.addEventListener('click', btn.onTap)
    container.appendChild(button)
  }

  document.body.innerHTML = ''
  document.body.appendChild(container)
}

Page({ build })
```

---

### Task 8: App Service — Reminder Handler

**Files:**
- Create: `app-service/reminder.js`

- [ ] **Step 1: Create reminder App Service**

```javascript
import { log as Logger } from '@zos/utils'
import { notify } from '@zos/notification'
import { getSettings, getIntakes, isSlotCancelled, getTodayDateStr } from '../utils/storage'
import { createRetryAlarm } from '../utils/schedule'
import { ALARM_MODES } from '../utils/constants'

const logger = Logger.getLogger('aibolit-reminder')

AppService({
  onEvent(e) {
    logger.log(`reminder onEvent: ${e}`)

    let params
    try {
      params = JSON.parse(e)
    } catch (err) {
      logger.log(`Failed to parse event params: ${e}`)
      return
    }

    const { mode, slotId, medicationId, medicationName, dosage } = params
    if (!slotId) return

    const todayDateStr = getTodayDateStr()

    if (mode === ALARM_MODES.RETRY || mode === ALARM_MODES.SNOOZE) {
      const isCancelled = isSlotCancelled(slotId, todayDateStr)
      if (isCancelled) return

      const intakes = getIntakes()
      const alreadyTaken = intakes.some(i => i.scheduleId === slotId && i.date === todayDateStr && i.status === 'taken')
      if (alreadyTaken) return
    }

    if (mode === ALARM_MODES.REMINDER || mode === ALARM_MODES.RETRY) {
      const isCancelled = isSlotCancelled(slotId, todayDateStr)
      if (isCancelled) return

      const intakes = getIntakes()
      const alreadyTaken = intakes.some(i => i.scheduleId === slotId && i.date === todayDateStr && i.status === 'taken')
      if (alreadyTaken) return
    }

    const title = medicationName || 'Напоминание'
    const content = dosage ? `${dosage}` : 'Примите лекарство'

    notify({
      title: title,
      content: content,
      vibrate: 1,
      actions: [
        {
          text: 'Принял',
          file: 'app-service/take',
          param: JSON.stringify({ slotId, medicationId, medicationName, dosage }),
        },
        {
          text: 'Отложить',
          file: 'page/snooze/index',
          param: JSON.stringify({ slotId, medicationId, medicationName, dosage }),
        },
      ],
    })

    if (mode === ALARM_MODES.REMINDER) {
      const settings = getSettings()
      createRetryAlarm(slotId, medicationId, medicationName, dosage, settings.retryInterval)
    }

    logger.log(`Notification sent for ${title}`)
  },

  onInit(e) {
    logger.log(`reminder onInit(${e})`)
  },

  onDestroy() {
    logger.log('reminder onDestroy')
  },
})
```

---

### Task 9: App Service — Take Handler

**Files:**
- Create: `app-service/take.js`

- [ ] **Step 1: Create take handler**

```javascript
import { log as Logger } from '@zos/utils'
import { addIntake, getTodayDateStr } from '../utils/storage'
import { sendIntakeToPhone } from '../utils/sync'
import { INTAKE_STATUS } from '../utils/constants'

const logger = Logger.getLogger('aibolit-take')

AppService({
  onEvent(e) {
    logger.log(`take onEvent: ${e}`)

    let params
    try {
      params = JSON.parse(e)
    } catch (err) {
      logger.log(`Failed to parse: ${e}`)
      return
    }

    const { slotId, medicationId, medicationName, dosage } = params
    if (!slotId) return

    const todayDateStr = getTodayDateStr()
    const now = new Date()
    const takenTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    const intake = {
      id: `intake_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      medicationId: medicationId || '',
      scheduleId: slotId,
      date: todayDateStr,
      scheduledTime: '',
      takenTime: takenTime,
      status: INTAKE_STATUS.TAKEN,
    }

    addIntake(intake)
    sendIntakeToPhone(intake)
    logger.log(`Medication ${medicationName} taken at ${takenTime}`)
  },

  onInit(e) {
    logger.log('take onInit')
  },

  onDestroy() {
    logger.log('take onDestroy')
  },
})
```

---

### Task 10: App Service — Snooze Handler

**Files:**
- Create: `app-service/snooze-handler.js`

- [ ] **Step 1: Create snooze handler**

```javascript
import { log as Logger } from '@zos/utils'
import { createSnoozeAlarm } from '../utils/schedule'
import { addIntake, getTodayDateStr } from '../utils/storage'
import { INTAKE_STATUS } from '../utils/constants'

const logger = Logger.getLogger('aibolit-snooze')

AppService({
  onEvent(e) {
    logger.log(`snooze-handler onEvent: ${e}`)

    let params
    try {
      params = JSON.parse(e)
    } catch (err) {
      logger.log(`Failed to parse: ${e}`)
      return
    }

    const { slotId, medicationId, medicationName, dosage, delayMinutes } = params
    if (!slotId || !delayMinutes) return

    createSnoozeAlarm(slotId, medicationId, medicationName, dosage, delayMinutes)

    const todayDateStr = getTodayDateStr()
    const now = new Date()
    const snoozeRecord = {
      id: `snooze_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      medicationId: medicationId || '',
      scheduleId: slotId,
      date: todayDateStr,
      scheduledTime: '',
      takenTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      status: INTAKE_STATUS.SNOOZED,
    }

    addIntake(snoozeRecord)
    logger.log(`Snoozed ${medicationName} for ${delayMinutes}min`)
  },

  onInit(e) {
    logger.log('snooze-handler onInit')
  },

  onDestroy() {
    logger.log('snooze-handler onDestroy')
  },
})
```

---

### Task 11: Device App — Page 1 (Upcoming Intakes)

**Files:**
- Create: `page/home/index.js`

- [ ] **Step 1: Create upcoming intakes page**

```javascript
import { log as Logger } from '@zos/utils'
import { createWidget, widget, align, text_style } from '@zos/ui'
import { getMedications, getSchedule, getIntakes, getCancellations, getTodayDateStr } from '../../utils/storage'

const logger = Logger.getLogger('aibolit-home')

let currentPage = null

Page({
  state: {
    slots: [],
  },

  build() {
    logger.log('home page build')
    this.refreshView()
  },

  onInit() {
    logger.log('home page onInit')
  },

  onDestroy() {
    logger.log('home page onDestroy')
  },

  refreshView() {
    const medications = getMedications()
    const schedule = getSchedule()
    const intakes = getIntakes()
    const cancellations = getCancellations()
    const todayDateStr = getTodayDateStr()
    const currentTime = new Date()
    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()

    const enabledMeds = medications.filter(m => m.enabled)
    const medMap = {}
    for (const med of enabledMeds) {
      medMap[med.id] = med
    }

    const relevantSlots = schedule
      .filter(s => medMap[s.medicationId])
      .filter(s => {
        const [h, m] = s.time.split(':').map(Number)
        const slotMinutes = h * 60 + m
        return slotMinutes >= currentMinutes
      })
      .filter(s => {
        const dayOfWeek = currentTime.getDay() === 0 ? 7 : currentTime.getDay()
        if (s.weekDays && s.weekDays.length > 0 && !s.weekDays.includes(dayOfWeek)) return false
        return true
      })
      .filter(s => {
        const taken = intakes.some(i => i.scheduleId === s.id && i.date === todayDateStr && i.status === 'taken')
        return !taken
      })
      .filter(s => {
        return !cancellations.some(c => c.scheduleId === s.id && c.date === todayDateStr)
      })

    const grouped = {}
    for (const slot of relevantSlots) {
      if (!grouped[slot.id]) {
        grouped[slot.id] = { ...slot, medications: [] }
      }
      grouped[slot.id].medications.push(medMap[slot.medicationId])
    }

    const sortedSlots = Object.values(grouped).sort((a, b) => {
      return a.time.localeCompare(b.time)
    })

    this.state.slots = sortedSlots
    this.renderUpcoming(sortedSlots)
  },

  renderUpcoming(slots) {
    const screenWidth = 480
    let y = 20

    const title = createWidget(widget.TEXT, {
      x: 0,
      y: y,
      w: screenWidth,
      h: 36,
      color: 0xffffff,
      text_size: 20,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'Ближайшие приёмы',
    })

    y += 50

    if (slots.length === 0) {
      createWidget(widget.TEXT, {
        x: 0,
        y: y,
        w: screenWidth,
        h: 36,
        color: 0x888888,
        text_size: 16,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: 'Нет предстоящих приёмов',
      })
      return
    }

    for (const slot of slots) {
      if (y > 480) break

      createWidget(widget.TEXT, {
        x: 20,
        y: y,
        w: screenWidth - 40,
        h: 30,
        color: 0x4fc3f7,
        text_size: 16,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: `───── ${slot.time} ────`,
      })
      y += 35

      for (const med of slot.medications) {
        createWidget(widget.TEXT, {
          x: 40,
          y: y,
          w: screenWidth - 80,
          h: 28,
          color: 0xffffff,
          text_size: 15,
          align_h: align.LEFT,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: `${med.name} ${med.dosage}`,
        })
        y += 30
      }

      const checkboxX = screenWidth - 50
      const checkboxY = y - (slot.medications.length * 30) - 5
      const takeAllBtn = createWidget(widget.TEXT, {
        x: checkboxX,
        y: checkboxY,
        w: 40,
        h: slot.medications.length * 30 + 10,
        color: 0x4fc3f7,
        text_size: 22,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: '☐',
      })
      takeAllBtn.addEventListener(widget.CLICK_EVENT, () => {
        this.takeSlot(slot)
      })

      y += 10
    }

    const planBtn = createWidget(widget.TEXT, {
      x: 0,
      y: y + 10,
      w: screenWidth,
      h: 36,
      color: 0x888888,
      text_size: 16,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: '[Полный план →]',
    })
    planBtn.addEventListener(widget.CLICK_EVENT, () => {
      router.push({ url: 'page/plan/index' })
    })
  },

  takeSlot(slot) {
    const { addIntake, getTodayDateStr } = require('../../utils/storage')
    const { sendIntakeToPhone } = require('../../utils/sync')

    const todayDateStr = getTodayDateStr()
    const now = new Date()
    const takenTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    for (const med of slot.medications) {
      const intake = {
        id: `intake_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        medicationId: med.id,
        scheduleId: slot.id,
        date: todayDateStr,
        scheduledTime: slot.time,
        takenTime: takenTime,
        status: 'taken',
      }
      addIntake(intake)
      sendIntakeToPhone(intake)
    }

    this.refreshView()
  },
})
```

---

### Task 12: Device App — Page 2 (Full Day Plan)

**Files:**
- Create: `page/plan/index.js`

- [ ] **Step 1: Create full day plan page**

```javascript
import { log as Logger } from '@zos/utils'
import { createWidget, widget, align, text_style } from '@zos/ui'
import {
  getMedications,
  getSchedule,
  getIntakes,
  getCancellations,
  addCancellation,
  removeCancellation,
  getTodayDateStr,
  addIntake,
  removeIntake,
} from '../../utils/storage'
import { sendIntakeToPhone, sendCancellationToPhone } from '../../utils/sync'

const logger = Logger.getLogger('aibolit-plan')

Page({
  state: {
    slots: [],
  },

  build() {
    logger.log('plan page build')
    this.refreshView()
  },

  onInit() {
    logger.log('plan page onInit')
  },

  onDestroy() {
    logger.log('plan page onDestroy')
  },

  refreshView() {
    const medications = getMedications()
    const schedule = getSchedule()
    const intakes = getIntakes()
    const cancellations = getCancellations()
    const todayDateStr = getTodayDateStr()

    const enabledMeds = medications.filter(m => m.enabled)
    const medMap = {}
    for (const med of enabledMeds) {
      medMap[med.id] = med
    }

    const dayOfWeek = new Date().getDay() === 0 ? 7 : new Date().getDay()

    const todaySlots = schedule
      .filter(s => medMap[s.medicationId])
      .filter(s => {
        if (s.weekDays && s.weekDays.length > 0 && !s.weekDays.includes(dayOfWeek)) return false
        return true
      })

    const grouped = {}
    for (const slot of todaySlots) {
      if (!grouped[slot.id]) {
        grouped[slot.id] = { ...slot, medications: [] }
      }
      grouped[slot.id].medications.push(medMap[slot.medicationId])
    }

    const sortedSlots = Object.values(grouped).sort((a, b) => a.time.localeCompare(b.time))

    for (const slot of sortedSlots) {
      const slotIntakes = intakes.filter(i => i.scheduleId === slot.id && i.date === todayDateStr)
      const takenIntake = slotIntakes.find(i => i.status === 'taken')
      const isCancelled = cancellations.some(c => c.scheduleId === slot.id && c.date === todayDateStr)

      slot._taken = !!takenIntake
      slot._takenTime = takenIntake ? takenIntake.takenTime : null
      slot._cancelled = isCancelled
    }

    this.state.slots = sortedSlots
    this.renderPlan(sortedSlots)
  },

  renderPlan(slots) {
    const screenWidth = 480
    let y = 20

    createWidget(widget.TEXT, {
      x: 0,
      y: y,
      w: screenWidth,
      h: 36,
      color: 0xffffff,
      text_size: 20,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'План на сегодня',
    })
    y += 50

    if (slots.length === 0) {
      createWidget(widget.TEXT, {
        x: 0,
        y: y,
        w: screenWidth,
        h: 36,
        color: 0x888888,
        text_size: 16,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: 'Нет приёмов на сегодня',
      })
      return
    }

    for (const slot of slots) {
      if (y > 440) break

      const textColor = slot._cancelled ? 0x666666 : (slot._taken ? 0x4caf50 : 0xffffff)
      const headerDecoration = slot._cancelled ? text_style.STRIKETHROUGH : text_style.NONE
      const headerText = slot._taken
        ? `───── ${slot.time} ──── ✓`
        : `───── ${slot.time} ────`

      createWidget(widget.TEXT, {
        x: 20,
        y: y,
        w: screenWidth - 40,
        h: 30,
        color: textColor,
        text_size: 16,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
        text_style: headerDecoration,
        text: headerText,
      })
      y += 35

      for (const med of slot.medications) {
        const medColor = slot._cancelled ? 0x555555 : (slot._taken ? 0x888888 : 0xffffff)
        const medDecor = slot._cancelled ? text_style.STRIKETHROUGH : text_style.NONE
        createWidget(widget.TEXT, {
          x: 40,
          y: y,
          w: screenWidth - 80,
          h: 28,
          color: medColor,
          text_size: 15,
          align_h: align.LEFT,
          align_v: align.CENTER_V,
          text_style: medDecor,
          text: `${slot._taken ? '✓ ' : '  '}${med.name} ${med.dosage}`,
        })
        y += 28
      }

      if (slot._taken && slot._takenTime) {
        createWidget(widget.TEXT, {
          x: 40,
          y: y,
          w: screenWidth - 80,
          h: 22,
          color: 0x666666,
          text_size: 13,
          align_h: align.LEFT,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: `приняты в ${slot._takenTime}`,
        })
        y += 25
      }

      if (slot._cancelled) {
        const restoreBtn = createWidget(widget.TEXT, {
          x: 40,
          y: y,
          w: screenWidth - 80,
          h: 22,
          color: 0x4fc3f7,
          text_size: 13,
          align_h: align.LEFT,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: 'вернуть прием',
        })
        restoreBtn.addEventListener(widget.CLICK_EVENT, () => {
          this.restoreSlot(slot)
        })
        y += 25
      }

      const indicatorX = screenWidth - 50
      const indicatorY = y - (slot.medications.length * 28) - (slot._takenTime ? 25 : 0) - 5
      const indicatorH = slot.medications.length * 28 + 10

      if (!slot._cancelled && !slot._taken) {
        const checkBtn = createWidget(widget.TEXT, {
          x: indicatorX,
          y: indicatorY,
          w: 40,
          h: indicatorH,
          color: 0xffffff,
          text_size: 22,
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: '☐',
        })
        checkBtn.addEventListener(widget.CLICK_EVENT, () => {
          this.takeSlot(slot)
        })
        checkBtn.addEventListener(widget.LONGPRESS_EVENT, () => {
          this.cancelSlot(slot)
        })
      }

      if (slot._taken) {
        const undoBtn = createWidget(widget.TEXT, {
          x: indicatorX,
          y: indicatorY,
          w: 40,
          h: indicatorH,
          color: 0x4caf50,
          text_size: 22,
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: '✓',
        })
        undoBtn.addEventListener(widget.CLICK_EVENT, () => {
          this.undoSlot(slot)
        })
      }

      y += 15
    }

    const backBtn = createWidget(widget.TEXT, {
      x: 0,
      y: y + 10,
      w: screenWidth,
      h: 36,
      color: 0x888888,
      text_size: 16,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: '[На главную]',
    })
    backBtn.addEventListener(widget.CLICK_EVENT, () => {
      router.push({ url: 'page/home/index' })
    })
  },

  takeSlot(slot) {
    const todayDateStr = getTodayDateStr()
    const now = new Date()
    const takenTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    for (const med of slot.medications) {
      const intake = {
        id: `intake_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        medicationId: med.id,
        scheduleId: slot.id,
        date: todayDateStr,
        scheduledTime: slot.time,
        takenTime: takenTime,
        status: 'taken',
      }
      addIntake(intake)
      sendIntakeToPhone(intake)
    }

    this.refreshView()
  },

  undoSlot(slot) {
    const todayDateStr = getTodayDateStr()
    const intakes = getIntakes()
    const toRemove = intakes.filter(i => i.scheduleId === slot.id && i.date === todayDateStr && i.status === 'taken')
    for (const intake of toRemove) {
      removeIntake(intake.id)
    }
    this.refreshView()
  },

  cancelSlot(slot) {
    const todayDateStr = getTodayDateStr()
    addCancellation(slot.id, todayDateStr)
    sendCancellationToPhone(slot.id, todayDateStr)
    this.refreshView()
  },

  restoreSlot(slot) {
    const todayDateStr = getTodayDateStr()
    removeCancellation(slot.id, todayDateStr)
    this.refreshView()
  },
})
```

---

### Task 13: Device App — Page 3 (Snooze Selection)

**Files:**
- Create: `page/snooze/index.js`

- [ ] **Step 1: Create snooze selection page**

```javascript
import { log as Logger } from '@zos/utils'
import { createWidget, widget, align, text_style } from '@zos/ui'
import { getSettings } from '../../utils/storage'
import { addIntake, getTodayDateStr } from '../../utils/storage'
import { INTAKE_STATUS } from '../../utils/constants'

const logger = Logger.getLogger('aibolit-snooze-page')

Page({
  state: {
    slotId: null,
    medicationId: null,
    medicationName: '',
    dosage: '',
  },

  build() {
    logger.log('snooze page build')
  },

  onInit(params) {
    logger.log(`snooze page onInit: ${params}`)

    let parsed
    try {
      parsed = JSON.parse(params)
    } catch (e) {
      logger.log(`Failed to parse params: ${params}`)
      return
    }

    this.state.slotId = parsed.slotId
    this.state.medicationId = parsed.medicationId
    this.state.medicationName = parsed.medicationName || ''
    this.state.dosage = parsed.dosage || ''

    this.renderSnoozeOptions()
  },

  onDestroy() {
    logger.log('snooze page onDestroy')
  },

  renderSnoozeOptions() {
    const screenWidth = 480
    const settings = getSettings()
    const options = settings.snoozeOptions || [30, 45, 60, 90]
    let y = 40

    createWidget(widget.TEXT, {
      x: 0,
      y: y,
      w: screenWidth,
      h: 30,
      color: 0xffffff,
      text_size: 18,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: `${this.state.medicationName} ${this.state.dosage}`,
    })
    y += 45

    createWidget(widget.TEXT, {
      x: 0,
      y: y,
      w: screenWidth,
      h: 24,
      color: 0x888888,
      text_size: 14,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'Отложить на:',
    })
    y += 40

    const btnWidth = 140
    const btnHeight = 80
    const gap = 20
    const startX = (screenWidth - btnWidth * 2 - gap) / 2
    let col = 0
    let row = 0

    for (const minutes of options) {
      const bx = startX + col * (btnWidth + gap)
      const by = y + row * (btnHeight + gap)

      const btn = createWidget(widget.TEXT, {
        x: bx,
        y: by,
        w: btnWidth,
        h: btnHeight,
        color: 0x4fc3f7,
        text_size: 24,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: `${minutes}`,
      })

      const subLabel = createWidget(widget.TEXT, {
        x: bx,
        y: by + btnHeight / 2 - 5,
        w: btnWidth,
        h: 24,
        color: 0x888888,
        text_size: 14,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: 'мин',
      })

      btn.addEventListener(widget.CLICK_EVENT, () => {
        this.confirmSnooze(minutes)
      })

      col++
      if (col >= 2) {
        col = 0
        row++
      }
    }
  },

  confirmSnooze(delayMinutes) {
    const { slotId, medicationId, medicationName, dosage } = this.state

    const todayDateStr = getTodayDateStr()
    const now = new Date()
    const record = {
      id: `snooze_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      medicationId: medicationId || '',
      scheduleId: slotId,
      date: todayDateStr,
      scheduledTime: '',
      takenTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      status: INTAKE_STATUS.SNOOZED,
    }
    addIntake(record)

    const param = JSON.stringify({
      slotId,
      medicationId,
      medicationName,
      dosage,
      delayMinutes,
    })

    router.push({ url: 'app-service/snooze-handler', param })
  },
})
```

---

### Task 14: Verify project setup

- [ ] **Step 1: Install dependencies**

```bash
cd zeppos-medication-reminder
npm install
```

Expected: `@zeppos/device-types` and `@zeppos/zml` installed in node_modules

- [ ] **Step 2: Verify app.json structure**

```bash
node -e "const cfg = require('./app.json'); console.log(JSON.stringify(cfg, null, 2))"
```

Expected: Valid JSON output matching the config above

- [ ] **Step 3: Verify all files exist**

```bash
ls app.js app.json package.json utils/constants.js utils/storage.js utils/schedule.js utils/sync.js app-side/index.js setting/index.js page/home/index.js page/plan/index.js page/snooze/index.js app-service/reminder.js app-service/take.js app-service/snooze-handler.js
```

Expected: All files listed exist

---

### Task 15: Build and preview

- [ ] **Step 1: Build the app**

```bash
zeus build
```

Expected: `dist/` directory created with zab package

- [ ] **Step 2: Preview via simulator**

```bash
zeus dev
```

Expected: Connects to simulator, shows app UI
