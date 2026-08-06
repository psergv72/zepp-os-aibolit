# Надёжность синхронизации (ревизия, очередь, фоновый тик) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Устранить потери данных при синхронизации (затирание новыми более старыми, дубликаты), сериализовать отправку записей и обеспечить применение настроек с телефона с пересозданием будильников без запуска приложения на часах.

**Architecture:** Три решения по спеке `docs/superpowers/specs/2026-08-06-sync-reliability-design.md`:
1. **Ревизия конфига** — на телефоне монотонный `configRevision` в `settings.settingsStorage`, часы применяют снимок только если ревизия новее (единое правило для push/pull и фонового чтения `settings.settingsStorage`).
2. **Единая очередь + мьютекс** — отмены встают в `syncQueue`, `trySyncNow` сериализован (флаг + повторный план), на телефоне дедуп по `id` и правило «последняя запись по (intakeId, date) выигрывает».
3. **Фоновый sync-alarm** — периодический alarm (`REPEAT_MINUTE` + `repeat_period = syncInterval`), будит `app-service/reminder.js` с `mode:'sync'`, который применяет конфиг из `settings.settingsStorage`, вызывает `refreshAlarms()` и `retrySync()`.

**Tech Stack:** ZeppOS 4.2 (`@zeppos/zml`, `@zos/alarm`, `@zos/storage`), Node 24 (`node:test`) для unit-тестов.

**Testing note:** Запуск тестов — `node --test` из `src` (bare; форма с аргументом-каталогом падает на Node 24/Windows). Сборка — `zeus build -t "Amazfit Balance 2"` из `src` (`& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`).

---

### Task 1: Константы, стаб alarm и геттеры/сеттеры хранилища

**Files:**
- Modify: `src/test/helpers/stubs/zos-alarm.mjs`
- Modify: `src/utils/constants.js`
- Modify: `src/utils/storage.js`
- Test: `src/test/storage.test.js` (new)

- [ ] **Step 1: Написать падающие тесты для новых функций storage**

Создать `src/test/storage.test.js`:

```js
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const storage = await import('./helpers/stubs/zos-storage.mjs')
const {
  getConfigRevision,
  setConfigRevision,
  getSyncAlarmId,
  setSyncAlarmId,
  clearSyncAlarmId,
} = await import('../utils/storage.js')

function seed() {
  storage.__resetStorage()
  new storage.ShareLocalStorage('aibolit-data.json')
}

beforeEach(() => {
  seed()
})

test('getConfigRevision возвращает 0, если ревизия не задана', () => {
  assert.equal(getConfigRevision(), 0)
})

test('setConfigRevision сохраняет число, getConfigRevision его возвращает', () => {
  setConfigRevision(7)
  assert.equal(getConfigRevision(), 7)
})

test('getSyncAlarmId возвращает null, если id не задан', () => {
  assert.equal(getSyncAlarmId(), null)
})

test('setSyncAlarmId сохраняет id, clearSyncAlarmId сбрасывает в null', () => {
  setSyncAlarmId(42)
  assert.equal(getSyncAlarmId(), 42)
  clearSyncAlarmId()
  assert.equal(getSyncAlarmId(), null)
})
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

Run (из `src`): `node --test test/storage.test.js`
Expected: FAIL — `getConfigRevision is not a function`.

- [ ] **Step 3: Добавить константы в `src/utils/constants.js`**

В объект `STORAGE_KEYS` добавить два ключа (после `SYNC_QUEUE`):

```js
  SYNC_QUEUE: 'syncQueue',
  CONFIG_REVISION: 'configRevision',
  SYNC_ALARM_ID: 'syncAlarmId',
```

В объект `ALARM_MODES` добавить:

```js
export const ALARM_MODES = {
  REMINDER: 'reminder',
  RETRY: 'retry',
  SNOOZE: 'snooze',
  SYNC: 'sync',
}
```

- [ ] **Step 4: Добавить REPEAT_MINUTE в стаб `src/test/helpers/stubs/zos-alarm.mjs`**

Полное новое содержимое файла:

```js
const calls = []

export function set(option) {
  calls.push({ method: 'set', option })
  return calls.length
}

export function cancel(id) {
  calls.push({ method: 'cancel', id })
}

export function getAllAlarms() {
  return []
}

export const REPEAT_WEEK = 4
export const REPEAT_ONCE = 0
export const REPEAT_MINUTE = 1

export function __getCalls() {
  return calls
}

export function __reset() {
  calls.length = 0
}
```

- [ ] **Step 5: Реализовать геттеры/сеттеры в `src/utils/storage.js`**

В конце файла (после `clearAll()`) добавить:

```js
export function getConfigRevision() {
  const value = getItem(STORAGE_KEYS.CONFIG_REVISION, 0)
  return typeof value === 'number' && !isNaN(value) ? value : 0
}

export function setConfigRevision(revision) {
  setItem(STORAGE_KEYS.CONFIG_REVISION, revision)
}

export function getSyncAlarmId() {
  const value = getItem(STORAGE_KEYS.SYNC_ALARM_ID, null)
  return typeof value === 'number' ? value : null
}

export function setSyncAlarmId(id) {
  setItem(STORAGE_KEYS.SYNC_ALARM_ID, id)
}

export function clearSyncAlarmId() {
  removeItem(STORAGE_KEYS.SYNC_ALARM_ID)
}
```

- [ ] **Step 6: Запустить тесты**

Run (из `src`): `node --test test/storage.test.js`
Expected: `pass 4` / `fail 0`.

- [ ] **Step 7: Commit**

```bash
git add src/utils/constants.js src/utils/storage.js src/test/storage.test.js src/test/helpers/stubs/zos-alarm.mjs
git commit -m "feat: add config revision and sync alarm id storage helpers"
```

---

### Task 2: Ревизия конфига в `watch-config.js`

**Files:**
- Modify: `src/utils/watch-config.js`
- Test: `src/test/watch-config.test.js` (new)

- [ ] **Step 1: Написать падающие тесты**

Создать `src/test/watch-config.test.js`:

```js
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const storage = await import('./helpers/stubs/zos-storage.mjs')
const { applyConfigToStorage, applyConfigFromSettings } = await import('../utils/watch-config.js')

function seed() {
  storage.__resetStorage()
  new storage.ShareLocalStorage('aibolit-data.json')
}

beforeEach(() => {
  seed()
})

test('applyConfigToStorage применяет конфиг с более новой ревизией и сохраняет ревизию', () => {
  const result = applyConfigToStorage({
    revision: 5,
    medications: [{ id: 'm1' }],
    intakes: [{ id: 'i1' }],
    settings: { minFontSize: 20 },
  })

  assert.equal(result, true)
  const store = storage.__stores().get('aibolit-data.json')
  assert.deepEqual(store.get('medications'), [{ id: 'm1' }])
  assert.deepEqual(store.get('intakes'), [{ id: 'i1' }])
  assert.deepEqual(store.get('settings'), { minFontSize: 20 })
  assert.equal(store.get('configRevision'), 5)
})

test('applyConfigToStorage игнорирует конфиг со старой или равной ревизией', () => {
  applyConfigToStorage({ revision: 5, medications: [{ id: 'm1' }] })

  const result = applyConfigToStorage({ revision: 4, medications: [{ id: 'm2' }] })
  const resultEqual = applyConfigToStorage({ revision: 5, medications: [{ id: 'm3' }] })

  assert.equal(result, false)
  assert.equal(resultEqual, false)
  const store = storage.__stores().get('aibolit-data.json')
  assert.deepEqual(store.get('medications'), [{ id: 'm1' }])
})

test('applyConfigToStorage игнорирует конфиг без числовой ревизии', () => {
  assert.equal(applyConfigToStorage({ medications: [{ id: 'm1' }] }), false)
  assert.equal(applyConfigToStorage(null), false)
})

test('applyConfigFromSettings применяет настройки с более новой ревизией из settings.settingsStorage', () => {
  globalThis.settings = {
    settingsStorage: {
      getItem(key) {
        const map = {
          configRevision: '3',
          medications: JSON.stringify([{ id: 'm1' }]),
          intakes: JSON.stringify([{ id: 'i1' }]),
          settings: JSON.stringify({ minFontSize: 22 }),
        }
        return map[key] !== undefined ? map[key] : null
      },
    },
  }

  const result = applyConfigFromSettings()

  delete globalThis.settings
  assert.equal(result, true)
  const store = storage.__stores().get('aibolit-data.json')
  assert.deepEqual(store.get('medications'), [{ id: 'm1' }])
  assert.equal(store.get('configRevision'), 3)
})

test('applyConfigFromSettings игнорирует настройки, если ревизия не новее', () => {
  applyConfigToStorage({ revision: 5, medications: [{ id: 'm1' }] })

  globalThis.settings = {
    settingsStorage: {
      getItem(key) {
        const map = {
          configRevision: '4',
          medications: JSON.stringify([{ id: 'm9' }]),
        }
        return map[key] !== undefined ? map[key] : null
      },
    },
  }

  const result = applyConfigFromSettings()

  delete globalThis.settings
  assert.equal(result, false)
  const store = storage.__stores().get('aibolit-data.json')
  assert.deepEqual(store.get('medications'), [{ id: 'm1' }])
})
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

Run (из `src`): `node --test test/watch-config.test.js`
Expected: FAIL — первые 3 теста не проходят (ревизия не проверяется).

- [ ] **Step 3: Реализовать ревизию в `src/utils/watch-config.js`**

Полное новое содержимое файла:

```js
import { ZML_METHODS, STORAGE_KEYS } from './constants'
import { setMedications, setIntakes, setSettings, getConfigRevision, setConfigRevision } from './storage'
import { parseSettingsItem } from './config-sync'

export function getMessaging() {
  try {
    const app = getApp()
    return app && app._options && app._options.globalData && app._options.globalData.messaging
  } catch (e) {
    return null
  }
}

export function getSettingsStorage() {
  try {
    if (typeof settings !== 'undefined' && settings && settings.settingsStorage) {
      return settings.settingsStorage
    }
  } catch (e) {
    return null
  }
  return null
}

export function applyConfigToStorage(config) {
  if (!config) return false
  if (typeof config.revision !== 'number') return false
  if (config.revision <= getConfigRevision()) return false
  if (Array.isArray(config.medications)) setMedications(config.medications)
  if (Array.isArray(config.intakes)) setIntakes(config.intakes)
  if (config.settings && typeof config.settings === 'object') setSettings(config.settings)
  setConfigRevision(config.revision)
  return true
}

export function applyConfigFromSettings() {
  const storage = getSettingsStorage()
  if (!storage) return false

  const revisionRaw = storage.getItem(STORAGE_KEYS.CONFIG_REVISION)
  const revision = parseSettingsItem(revisionRaw)
  if (typeof revision !== 'number') return false
  if (revision <= getConfigRevision()) return false

  let applied = false

  const medsRaw = storage.getItem('medications')
  if (medsRaw !== null && medsRaw !== undefined) {
    const value = parseSettingsItem(medsRaw)
    if (Array.isArray(value)) {
      setMedications(value)
      applied = true
    }
  }

  const intakesRaw = storage.getItem('intakes')
  if (intakesRaw !== null && intakesRaw !== undefined) {
    const value = parseSettingsItem(intakesRaw)
    if (Array.isArray(value)) {
      setIntakes(value)
      applied = true
    }
  }

  const settingsRaw = storage.getItem('settings')
  if (settingsRaw !== null && settingsRaw !== undefined) {
    const value = parseSettingsItem(settingsRaw)
    if (value && typeof value === 'object') {
      setSettings(value)
    }
  }

  if (applied) setConfigRevision(revision)
  return applied
}

export function fetchConfigFromSide(maxAttempts = 6, delayMs = 1000) {
  return new Promise((resolve) => {
    if (applyConfigFromSettings()) {
      resolve(true)
      return
    }

    const attempt = (n) => {
      const messaging = getMessaging()
      if (!messaging || typeof messaging.request !== 'function') {
        if (n > 0) {
          setTimeout(() => attempt(n - 1), delayMs)
          return
        }
        resolve(false)
        return
      }
      messaging.request({ method: ZML_METHODS.GET_CONFIG })
        .then((result) => {
          applyConfigToStorage(result && result.config)
          resolve(!!(result && result.config))
        })
        .catch(() => {
          if (n > 0) {
            setTimeout(() => attempt(n - 1), delayMs)
            return
          }
          resolve(false)
        })
    }
    attempt(maxAttempts)
  })
}
```

Примечание: `getItem` в тестовом фейке возвращает `null` для неизвестных ключей, `STORAGE_KEYS.CONFIG_REVISION` = `'configRevision'` — совпадает с ключом фейка.

- [ ] **Step 4: Запустить тесты**

Run (из `src`): `node --test test/watch-config.test.js`
Expected: `pass 5` / `fail 0`.

- [ ] **Step 5: Убедиться, что старые тесты не сломались**

Run (из `src`): `node --test test/config-sync.test.js`
Expected: `pass 5` / `fail 0`.

- [ ] **Step 6: Commit**

```bash
git add src/utils/watch-config.js src/test/watch-config.test.js
git commit -m "feat: apply config only when revision is newer"
```

---

### Task 3: App-side — ревизия при изменении настроек и дедуп записей

**Files:**
- Modify: `src/app-side/index.js`
- Test: `src/test/app-side.test.js` (new)

- [ ] **Step 1: Написать падающие тесты**

Создать `src/test/app-side.test.js`:

```js
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let sideOpts = null
globalThis.AppSideService = (opts) => { sideOpts = opts }

await import('../app-side/index.js')

const storageMap = new Map()

function fakeSettingsStorage() {
  return {
    getItem(key) {
      return storageMap.has(key) ? storageMap.get(key) : null
    },
    setItem(key, value) {
      storageMap.set(key, value)
    },
  }
}

function seed() {
  storageMap.clear()
  const ss = fakeSettingsStorage()
  ss.setItem('medications', JSON.stringify([{ id: 'm1', name: 'Парацетамол' }]))
  ss.setItem('intakes', JSON.stringify([{ id: 'i1', time: '08:00' }]))
  ss.setItem('settings', JSON.stringify({ retryInterval: 60 }))
  ss.setItem('configRevision', '2')
  globalThis.settings = { settingsStorage: ss }
  sideOpts.settings = {
    getItem: (k) => ss.getItem(k),
    setItem: (k, v) => ss.setItem(k, v),
  }
}

beforeEach(() => {
  seed()
})

test('buildConfig включает актуальную ревизию', () => {
  const config = sideOpts.buildConfig()
  assert.equal(config.revision, 2)
  assert.equal(config.medications[0].id, 'm1')
})

test('onSettingsChange для CONFIG_KEYS увеличивает ревизию и пушит конфиг', () => {
  const calls = []
  sideOpts.call = (payload) => { calls.push(payload) }

  sideOpts.onSettingsChange({ key: 'intakes' })

  assert.equal(JSON.parse(storageMap.get('configRevision')), 3)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'config_synced')
  assert.equal(calls[0].params.config.revision, 3)
})

test('onSettingsChange для прочих ключей не трогает ревизию и не пушит', () => {
  const calls = []
  sideOpts.call = (payload) => { calls.push(payload) }

  sideOpts.onSettingsChange({ key: 'history_2026-08-06' })

  assert.equal(JSON.parse(storageMap.get('configRevision')), 2)
  assert.equal(calls.length, 0)
})

test('onRequest SYNC_INTAKE дедуплицирует записи по id', () => {
  let res = null
  sideOpts.onRequest({
    method: 'sync_intake',
    params: { records: [
      { id: 'log_1', intakeId: 'i1', date: '2026-08-06', status: 'taken' },
    ] },
  }, (err, data) => { res = data })

  assert.deepEqual(res, { success: true, count: 1 })

  sideOpts.onRequest({
    method: 'sync_intake',
    params: { records: [
      { id: 'log_1', intakeId: 'i1', date: '2026-08-06', status: 'taken' },
      { id: 'log_2', intakeId: 'i1', date: '2026-08-06', status: 'snoozed' },
    ] },
  }, () => {})

  const history = JSON.parse(storageMap.get('history_2026-08-06'))
  assert.equal(history.length, 2)
  assert.ok(history.some(r => r.id === 'log_1'))
  assert.ok(history.some(r => r.id === 'log_2'))
})

test('onRequest SYNC_INTAKE заменяет предыдущую запись по (intakeId, date)', () => {
  sideOpts.onRequest({
    method: 'sync_intake',
    params: { records: [
      { id: 'log_1', intakeId: 'i1', date: '2026-08-06', status: 'taken' },
    ] },
  }, () => {})

  sideOpts.onRequest({
    method: 'sync_intake',
    params: { records: [
      { id: 'cancel_1', intakeId: 'i1', date: '2026-08-06', status: 'cancelled' },
    ] },
  }, () => {})

  const history = JSON.parse(storageMap.get('history_2026-08-06'))
  assert.equal(history.length, 1)
  assert.equal(history[0].id, 'cancel_1')
  assert.equal(history[0].status, 'cancelled')
})
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

Run (из `src`): `node --test test/app-side.test.js`
Expected: FAIL — нет `configRevision` в buildConfig, нет дедупа (duplicate появляется).

- [ ] **Step 3: Реализовать в `src/app-side/index.js`**

Заменить методы `onSettingsChange`, `buildConfig` и блок `SYNC_INTAKE` в `onRequest`, а также удалить блок `SYNC_CANCELLATION`.

Полное новое содержимое файла:

```js
import { BaseSideService } from '@zeppos/zml/base-side'
import { ZML_METHODS } from '../utils/constants'
import { CONFIG_KEYS, parseSettingsItem } from '../utils/config-sync'

AppSideService(
  BaseSideService({
    onInit() {
      console.log('Side Service onInit')
    },

    onRun() {
      console.log('Side Service onRun')
      this.pushConfigToWatch()
    },

    onDestroy() {
      console.log('Side Service onDestroy')
    },

    onSettingsChange({ key }) {
      console.log(`onSettingsChange key: ${key}`)
      if (CONFIG_KEYS.includes(key)) {
        this.bumpConfigRevision()
        this.pushConfigToWatch()
      }
    },

    bumpConfigRevision() {
      const current = parseSettingsItem(this.settings.getItem('configRevision')) || 0
      const next = (typeof current === 'number' ? current : 0) + 1
      this.settings.setItem('configRevision', next)
    },

    buildConfig() {
      const config = {}
      for (const key of CONFIG_KEYS) {
        const raw = this.settings.getItem(key)
        const value = parseSettingsItem(raw)
        if (value !== null) {
          config[key] = value
        }
      }
      const revision = parseSettingsItem(this.settings.getItem('configRevision')) || 0
      config.revision = typeof revision === 'number' ? revision : 0
      return config
    },

    pushConfigToWatch() {
      const config = this.buildConfig()
      try {
        this.call({ method: ZML_METHODS.CONFIG_SYNCED, params: { config } })
      } catch (error) {
        console.log(`Config sync notify failed: ${error}`)
      }
      console.log('Config pushed to watch')
    },

    onRequest(req, res) {
      console.log(`onRequest method: ${req.method}`)

      if (req.method === ZML_METHODS.GET_CONFIG) {
        res(null, { config: this.buildConfig() })
        return
      }

      if (req.method === ZML_METHODS.GET_TAKE_LOGS) {
        const { date } = req.params || {}
        const dateKey = `history_${date}`
        const existing = settings.settingsStorage.getItem(dateKey)
        const records = existing ? JSON.parse(existing) : []
        res(null, { records })
        return
      }

      if (req.method === ZML_METHODS.SYNC_INTAKE) {
        const { records } = req.params
        if (records && records.length > 0) {
          for (const record of records) {
            if (!record || !record.id) continue
            const dateKey = `history_${record.date}`
            const existing = settings.settingsStorage.getItem(dateKey)
            const history = existing ? JSON.parse(existing) : []
            const idx = history.findIndex(r => r.id === record.id)
            if (idx >= 0) {
              history[idx] = record
            } else {
              const conflictIdx = history.findIndex(r => r.intakeId === record.intakeId && r.date === record.date)
              if (conflictIdx >= 0) {
                history[conflictIdx] = record
              } else {
                history.push(record)
              }
            }
            settings.settingsStorage.setItem(dateKey, JSON.stringify(history))
          }
          res(null, { success: true, count: records.length })
        } else {
          res(null, { success: true, count: 0 })
        }
        return
      }

      res('unknown method', null)
    },

    onCall(data) {
      console.log(`onCall method: ${data.method}`)
    },
  })
)
```

Примечания:
- Метод `sync_cancellation` больше не обрабатывается (отмены идут через `sync_intake` со `status: 'cancelled'`).
- `this.settings` — обёртка над `settingsStorage` из `@zeppos/zml/base-side` (в тесте подменяется).

- [ ] **Step 4: Запустить тесты**

Run (из `src`): `node --test test/app-side.test.js`
Expected: `pass 5` / `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/app-side/index.js src/test/app-side.test.js
git commit -m "feat: config revision bump and idempotent intake dedup on phone"
```

---

### Task 4: Мьютекс отправки и отмена в единую очередь (`sync.js`)

**Files:**
- Modify: `src/utils/sync.js`
- Test: `src/test/sync.test.js`

- [ ] **Step 1: Обновить тесты `src/test/sync.test.js`**

Полное новое содержимое файла:

```js
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const storage = await import('./helpers/stubs/zos-storage.mjs')
const { initSync, retrySync, sendTakeLogToPhone, sendCancellationToPhone, fetchTakesFromPhone, mergeTakeRecords } = await import('../utils/sync.js')

function seed() {
  storage.__resetStorage()
  new storage.ShareLocalStorage('aibolit-data.json')
}

beforeEach(() => {
  seed()
  initSync(null)
})

test('sendTakeLogToPhone отправляет записи на телефон через request после initSync', async () => {
  const sent = []
  const fakeSide = {
    request(payload) {
      sent.push(payload)
      return Promise.resolve({ success: true, count: 1 })
    },
  }
  initSync(fakeSide)

  sendTakeLogToPhone({ id: 'log_1', intakeId: 'i1', status: 'taken' })
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(sent.length, 1)
  assert.equal(sent[0].method, 'sync_intake')
  assert.equal(sent[0].params.records.length, 1)
  assert.equal(sent[0].params.records[0].intakeId, 'i1')
})

test('sendTakeLogToPhone убирает из очереди успешно отправленные записи', async () => {
  const fakeSide = {
    request(payload) {
      return Promise.resolve({ success: true, count: payload.params.records.length })
    },
  }
  initSync(fakeSide)

  sendTakeLogToPhone({ id: 'log_1', intakeId: 'i1', status: 'taken' })
  await new Promise((resolve) => setTimeout(resolve, 0))

  const queue = storage.__stores().get('aibolit-data.json').get('syncQueue')
  assert.ok(queue, 'syncQueue существует')
  assert.equal(queue.length, 0)
})

test('два sendTakeLogToPhone подряд не дублируют записи в одном payload', async () => {
  const sent = []
  const fakeSide = {
    request(payload) {
      sent.push(payload)
      return Promise.resolve({ success: true, count: payload.params.records.length })
    },
  }
  initSync(fakeSide)

  sendTakeLogToPhone({ id: 'log_1', intakeId: 'i1', status: 'taken' })
  sendTakeLogToPhone({ id: 'log_2', intakeId: 'i2', status: 'taken' })
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(sent.length, 2)
  const first = sent[0].params.records.map(r => r.id)
  const second = sent[1].params.records.map(r => r.id)
  assert.deepEqual([...first, ...second].sort(), ['log_1', 'log_2'])
})

test('sendTakeLogToPhone не вызывает request до initSync', async () => {
  const sent = []
  const fakeSide = {
    request(payload) {
      sent.push(payload)
      return Promise.resolve()
    },
  }

  sendTakeLogToPhone({ id: 'log_1', intakeId: 'i1', status: 'taken' })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(sent.length, 0)
})

test('retrySync отправляет накопленные записи из очереди', async () => {
  const sent = []
  const fakeSide = {
    request(payload) {
      sent.push(payload)
      return Promise.resolve({ success: true, count: payload.params.records.length })
    },
  }
  initSync(fakeSide)
  storage.__stores().get('aibolit-data.json').set('syncQueue', [
    { id: 'log_q', intakeId: 'i1', status: 'taken' },
  ])

  retrySync()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(sent.length, 1)
  assert.equal(sent[0].method, 'sync_intake')
  assert.equal(sent[0].params.records.length, 1)
  assert.equal(sent[0].params.records[0].id, 'log_q')
})

test('fetchTakesFromPhone возвращает записи из request', async () => {
  const fakeSide = {
    request(payload) {
      assert.equal(payload.method, 'get_take_logs')
      assert.equal(payload.params.date, '2026-08-05')
      return Promise.resolve({ records: [{ id: 'log_x', intakeId: 'i1', status: 'taken' }] })
    },
  }
  initSync(fakeSide)

  const records = await fetchTakesFromPhone('2026-08-05')
  assert.equal(records.length, 1)
  assert.equal(records[0].id, 'log_x')
})

test('fetchTakesFromPhone возвращает пустой список до initSync', async () => {
  initSync(null)
  const records = await fetchTakesFromPhone('2026-08-05')
  assert.deepEqual(records, [])
})

test('fetchTakesFromPhone использует messaging из getApp() без initSync', async () => {
  const sent = []
  globalThis.getApp = () => ({
    _options: {
      globalData: {
        messaging: {
          request(payload) {
            sent.push(payload)
            return Promise.resolve({ records: [{ id: 'log_g', intakeId: 'i1', status: 'taken' }] })
          },
        },
      },
    },
  })
  initSync(null)

  const records = await fetchTakesFromPhone('2026-08-05')

  assert.equal(records.length, 1)
  assert.equal(records[0].id, 'log_g')
  assert.equal(sent[0].method, 'get_take_logs')
  delete globalThis.getApp
})

test('mergeTakeRecords добавляет только новые записи taken', () => {
  storage.__stores().get('aibolit-data.json').set('takeLogs', [
    { id: 'log_1', intakeId: 'i1', status: 'taken' },
  ])

  const changed = mergeTakeRecords([
    { id: 'log_1', intakeId: 'i1', status: 'taken' },
    { id: 'log_2', intakeId: 'i2', status: 'taken' },
    { id: 'log_3', intakeId: 'i3', status: 'cancelled' },
  ])

  assert.equal(changed, true)
  const logs = storage.__stores().get('aibolit-data.json').get('takeLogs')
  assert.equal(logs.length, 2)
  assert.ok(logs.some(i => i.id === 'log_2'))
  assert.ok(!logs.some(i => i.id === 'log_3'))
})

test('mergeTakeRecords не меняет ничего при пустом списке', () => {
  assert.equal(mergeTakeRecords([]), false)
  assert.equal(mergeTakeRecords(null), false)
})

test('sendCancellationToPhone встаёт в очередь и уходит через sync_intake со status cancelled', async () => {
  const sent = []
  const fakeSide = {
    request(payload) {
      sent.push(payload)
      return Promise.resolve({ success: true, count: payload.params.records.length })
    },
  }
  initSync(fakeSide)

  sendCancellationToPhone('i1', '2026-08-05')
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(sent.length, 1)
  assert.equal(sent[0].method, 'sync_intake')
  assert.equal(sent[0].params.records.length, 1)
  assert.equal(sent[0].params.records[0].intakeId, 'i1')
  assert.equal(sent[0].params.records[0].date, '2026-08-05')
  assert.equal(sent[0].params.records[0].status, 'cancelled')
})
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

Run (из `src`): `node --test test/sync.test.js`
Expected: FAIL — тест «два sendTakeLogToPhone» даёт дубликат `log_1` во втором payload; тест `sendCancellationToPhone` ожидает `sync_cancellation`.

- [ ] **Step 3: Реализовать мьютекс и очередь отмен в `src/utils/sync.js`**

Полное новое содержимое файла:

```js
import { log as Logger } from '@zos/utils'
import { ZML_METHODS, INTAKE_STATUS } from './constants'
import { getSyncQueue, addToSyncQueue, clearSyncedItems, pruneOldTakeLogs, getTakeLogs, setTakeLogs } from './storage'

const logger = Logger.getLogger('aibolit-sync')

let sideService = null
let syncing = false
let pendingSync = false

export function initSync(zmlSideService) {
  sideService = zmlSideService
  logger.log('Sync module initialized')
}

function getMessaging() {
  if (sideService && typeof sideService.request === 'function') return sideService
  try {
    const app = getApp()
    const messaging = app && app._options && app._options.globalData && app._options.globalData.messaging
    return messaging && typeof messaging.request === 'function' ? messaging : null
  } catch (e) {
    return null
  }
}

export function fetchTakesFromPhone(date) {
  const messaging = getMessaging()
  if (!messaging) return Promise.resolve([])

  return messaging.request({
    method: ZML_METHODS.GET_TAKE_LOGS,
    params: { date },
  })
    .then((result) => (result && result.records) || [])
    .catch((error) => {
      logger.log(`Fetch takes failed: ${error}`)
      return []
    })
}

export function mergeTakeRecords(records) {
  if (!records || records.length === 0) return false

  const takeLogs = getTakeLogs()
  let changed = false
  for (const record of records) {
    if (!record || !record.id || record.status !== 'taken') continue
    if (takeLogs.some(i => i.id === record.id)) continue
    takeLogs.push(record)
    changed = true
  }
  if (changed) setTakeLogs(takeLogs)
  return changed
}

export function sendTakeLogToPhone(takeLog) {
  addToSyncQueue(takeLog)
  scheduleSync()
}

export function sendCancellationToPhone(intakeId, date) {
  const record = {
    id: 'cancel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    intakeId,
    date,
    status: INTAKE_STATUS.CANCELLED,
  }
  addToSyncQueue(record)
  scheduleSync()
}

function scheduleSync() {
  if (syncing) {
    pendingSync = true
    return
  }
  syncing = true
  trySyncNow()
    .catch(() => {})
    .finally(() => {
      syncing = false
      if (pendingSync) {
        pendingSync = false
        scheduleSync()
      }
    })
}

function trySyncNow() {
  const messaging = getMessaging()
  if (!messaging) return Promise.resolve()

  const queue = getSyncQueue()
  if (queue.length === 0) return Promise.resolve()

  const payload = {
    method: ZML_METHODS.SYNC_INTAKE,
    params: {
      records: queue,
    },
  }

  const onSuccess = () => {
    const ids = queue.map(item => item.id)
    clearSyncedItems(ids)
    pruneOldTakeLogs()
    logger.log(`Synced ${ids.length} records to phone`)
  }

  try {
    const result = messaging.request(payload)
    if (result && typeof result.then === 'function') {
      return result.then(onSuccess).catch((error) => {
        logger.log(`Sync failed: ${error}, will retry later`)
      })
    }
    onSuccess()
    return Promise.resolve()
  } catch (error) {
    logger.log(`Sync failed: ${error}, will retry later`)
    return Promise.resolve()
  }
}

export function retrySync() {
  scheduleSync()
}
```

- [ ] **Step 4: Запустить тесты**

Run (из `src`): `node --test test/sync.test.js`
Expected: `pass 11` / `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/sync.js src/test/sync.test.js
git commit -m "feat: serialize sync sends with mutex and queue cancellations"
```

---

### Task 5: Sync-alarm и доработка `refreshAlarms`

**Files:**
- Modify: `src/utils/schedule.js`
- Test: `src/test/schedule.test.js`

- [ ] **Step 1: Обновить тесты `src/test/schedule.test.js`**

Существующие тесты ломаются: `refreshAlarms` теперь дополнительно создаёт sync-alarm (одним `set`-вызовом больше). Нужно фильтровать intake-вызовы по `param.mode === 'reminder'` и добавить новые тесты.

Полное новое содержимое файла:

```js
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const alarm = await import('./helpers/stubs/zos-alarm.mjs')
const storage = await import('./helpers/stubs/zos-storage.mjs')

const { refreshAlarms, createSyncAlarm } = await import('../utils/schedule.js')

function seed() {
  storage.__resetStorage()
  new storage.ShareLocalStorage('aibolit-data.json')
  storage.__stores().get('aibolit-data.json').set('medications', [
    { id: 'm1', name: 'Парацетамол', enabled: true },
    { id: 'm2', name: 'Аспирин', enabled: true },
    { id: 'm3', name: 'Отключён', enabled: false },
  ])
}

function intakeSets() {
  return alarm.__getCalls().filter(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'reminder')
}

beforeEach(() => {
  seed()
  alarm.__reset()
})

test('refreshAlarms создаёт alarm для каждого активного приёма, включая приёмы не на сегодняшний день', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: [1, 3, 5], items: [{ medicationId: 'm1', amount: '1' }] },
    { id: 'i2', time: '12:00', weekDays: [2, 4], items: [{ medicationId: 'm2', amount: '1' }] },
  ])

  refreshAlarms()

  const sets = intakeSets()
  assert.equal(sets.length, 2)
  const ids = sets.map(c => JSON.parse(c.option.param).intakeId)
  assert.deepEqual(ids.sort(), ['i1', 'i2'])
})

test('refreshAlarms не создаёт alarm для приёма без включённых лекарств', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm3', amount: '1' }] },
  ])

  refreshAlarms()

  const sets = intakeSets()
  assert.equal(sets.length, 0)
})

test('refreshAlarms создаёт alarm для уже принятого сегодня приёма (для будущих недель)', () => {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  storage.__stores().get('aibolit-data.json').set('takeLogs', [{
    intakeId: 'i1',
    date: todayStr,
    status: 'taken',
  }])

  refreshAlarms()

  const sets = intakeSets()
  assert.equal(sets.length, 1)
})

test('refreshAlarms создаёт alarm с REPEAT_WEEK и правильными week_days', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: [1, 4], items: [{ medicationId: 'm1', amount: '1' }] },
  ])

  refreshAlarms()

  const set = intakeSets()[0]
  assert.equal(set.option.repeat_type, 4)
  assert.equal(set.option.week_days, 2 | 16)
  assert.equal(set.option.url, 'app-service/reminder')
})

test('refreshAlarms всё равно создаёт alarm для отменённого сегодня приёма: решение принимает reminder при срабатывании', () => {
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  storage.__stores().get('aibolit-data.json').set('cancellations', [{
    intakeId: 'i1',
    date: todayStr,
  }])

  refreshAlarms()

  const sets = intakeSets()
  assert.equal(sets.length, 1)
})

test('createIntakeAlarm задаёт time строго в будущем, даже если время приёма уже прошло сегодня', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '00:01', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])

  refreshAlarms()

  const nowSeconds = Math.floor(Date.now() / 1000)
  const sets = intakeSets()
  assert.equal(sets.length, 1)
  assert.ok(sets[0].option.time > nowSeconds, `time ${sets[0].option.time} должен быть в будущем`)
})

test('refreshAlarms создаёт sync-alarm с REPEAT_MINUTE и repeat_period из настроек', () => {
  storage.__stores().get('aibolit-data.json').set('intakes', [
    { id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] },
  ])
  storage.__stores().get('aibolit-data.json').set('settings', { retryInterval: 60, syncInterval: 30, snoozeOptions: [30, 45, 60, 90], minFontSize: 16 })

  refreshAlarms()

  const syncSet = alarm.__getCalls().find(c => c.method === 'set' && JSON.parse(c.option.param).mode === 'sync')
  assert.ok(syncSet, 'sync-alarm создан')
  assert.equal(syncSet.option.url, 'app-service/reminder')
  assert.equal(syncSet.option.repeat_type, 1)
  assert.equal(syncSet.option.repeat_period, 30)
})

test('createSyncAlarm отменяет предыдущий sync-alarm и сохраняет новый id', () => {
  createSyncAlarm(60)
  const firstId = storage.__stores().get('aibolit-data.json').get('syncAlarmId')
  assert.equal(firstId, 1)

  createSyncAlarm(60)
  const cancels = alarm.__getCalls().filter(c => c.method === 'cancel')
  assert.ok(cancels.some(c => c.id === firstId), 'старый sync-alarm отменён')
  const newId = storage.__stores().get('aibolit-data.json').get('syncAlarmId')
  assert.notEqual(newId, firstId)
})
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

Run (из `src`): `node --test test/schedule.test.js`
Expected: FAIL — нет `createSyncAlarm` / sync-вызова в `refreshAlarms`.

- [ ] **Step 3: Реализовать `createSyncAlarm` и доработку `refreshAlarms` в `src/utils/schedule.js`**

Полное новое содержимое файла:

```js
import { set as setAlarm, cancel as cancelAlarm, getAllAlarms, REPEAT_WEEK, REPEAT_ONCE, REPEAT_MINUTE } from '@zos/alarm'
import { log as Logger } from '@zos/utils'
import { ALARM_MODES, DEFAULT_SETTINGS } from './constants'
import { getMedications, getIntakes, getSettings, getSyncAlarmId, setSyncAlarmId } from './storage'
import { getWeekDaysBitmask, getEnabledMedItems, isIntakeOnDay } from './intake-logic.js'

const logger = Logger.getLogger('aibolit-schedule')

function getNextAlarmTime(hours, minutes, weekDays) {
  const now = new Date()
  for (let i = 0; i < 8; i++) {
    const candidate = new Date(now)
    candidate.setDate(now.getDate() + i)
    candidate.setHours(hours, minutes, 0, 0)
    const dayOfWeek = candidate.getDay() === 0 ? 7 : candidate.getDay()
    if (isIntakeOnDay({ weekDays }, dayOfWeek) && candidate > now) {
      return Math.floor(candidate.getTime() / 1000)
    }
  }
  const fallback = new Date(now)
  fallback.setHours(hours, minutes, 0, 0)
  return Math.floor(fallback.getTime() / 1000)
}

export function createIntakeAlarm(intake) {
  const [hours, minutes] = intake.time.split(':').map(Number)
  const nextTime = getNextAlarmTime(hours, minutes, intake.weekDays)
  const weekDaysMask = getWeekDaysBitmask(intake.weekDays)
  const param = JSON.stringify({
    mode: ALARM_MODES.REMINDER,
    intakeId: intake.id,
  })

  const option = {
    url: 'app-service/reminder',
    time: nextTime,
    repeat_type: REPEAT_WEEK,
    week_days: weekDaysMask,
    param: param,
    store: true,
  }

  const id = setAlarm(option)
  logger.log(`Created alarm id=${id} for intake ${intake.id} at ${intake.time} next=${nextTime} week_days=${weekDaysMask} repeat=${REPEAT_WEEK}`)
  return id
}

export function createRetryAlarm(intakeId, delayMinutes) {
  const delaySeconds = delayMinutes * 60
  const param = JSON.stringify({
    mode: ALARM_MODES.RETRY,
    intakeId: intakeId,
  })

  const option = {
    url: 'app-service/reminder',
    delay: delaySeconds,
    repeat_type: REPEAT_ONCE,
    param: param,
    store: false,
  }

  const id = setAlarm(option)
  logger.log(`Created retry alarm id=${id} for intake ${intakeId} in ${delayMinutes}min`)
  return id
}

export function createSnoozeAlarm(intakeId, delayMinutes) {
  const delaySeconds = delayMinutes * 60
  const param = JSON.stringify({
    mode: ALARM_MODES.SNOOZE,
    intakeId: intakeId,
  })

  const option = {
    url: 'app-service/reminder',
    delay: delaySeconds,
    repeat_type: REPEAT_ONCE,
    param: param,
    store: false,
  }

  const id = setAlarm(option)
  logger.log(`Created snooze alarm id=${id} for intake ${intakeId} in ${delayMinutes}min`)
  return id
}

export function createSyncAlarm(syncInterval) {
  const prevId = getSyncAlarmId()
  if (prevId !== null) {
    try {
      cancelAlarm(prevId)
    } catch (e) {
      logger.log(`Cancel old sync alarm failed: ${e}`)
    }
  }

  const interval = Math.max(1, Math.round(syncInterval || DEFAULT_SETTINGS.syncInterval))
  const option = {
    url: 'app-service/reminder',
    repeat_type: REPEAT_MINUTE,
    repeat_period: interval,
    repeat_duration: 1,
    param: JSON.stringify({ mode: ALARM_MODES.SYNC }),
    store: true,
  }

  const id = setAlarm(option)
  setSyncAlarmId(id)
  logger.log(`Created sync alarm id=${id} repeat_period=${interval}min`)
  return id
}

export function refreshAlarms() {
  const intakes = getIntakes()
  const syncAlarmId = getSyncAlarmId()

  const allAlarms = getAllAlarms()
  if (allAlarms && allAlarms.length > 0) {
    for (const alarmId of allAlarms) {
      if (alarmId === syncAlarmId) continue
      cancelAlarm(alarmId)
    }
  }

  for (const intake of intakes) {
    if (getEnabledMedItems(intake, getMedications()).length === 0) continue

    createIntakeAlarm(intake)
  }

  const settings = getSettings()
  createSyncAlarm(settings.syncInterval)

  logger.log('Alarms refreshed')
}

export function cancelAlarmById(alarmId) {
  cancelAlarm(alarmId)
}
```

- [ ] **Step 4: Запустить тесты**

Run (из `src`): `node --test test/schedule.test.js`
Expected: `pass 8` / `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/schedule.js src/test/schedule.test.js
git commit -m "feat: add periodic sync alarm and refresh it on alarms refresh"
```

---

### Task 6: Фоновый тик `mode:'sync'` в `reminder.js`

**Files:**
- Modify: `src/app-service/reminder.js`
- Test: `src/test/reminder-service.test.js`

- [ ] **Step 1: Добавить падающий тест**

В конец `src/test/reminder-service.test.js` добавить:

```js
test('mode sync применяет настройки и не шлёт уведомление', () => {
  const settingsMap = {
    configRevision: JSON.stringify(2),
    medications: JSON.stringify([{ id: 'm2', name: 'Ибупрофен', enabled: true }]),
    intakes: JSON.stringify([{ id: 'i2', time: '09:00', weekDays: null, items: [{ medicationId: 'm2', amount: '1' }] }]),
  }
  globalThis.settings = {
    settingsStorage: {
      getItem(key) {
        return settingsMap[key] !== undefined ? settingsMap[key] : null
      },
    },
  }

  serviceOpts.onInit(JSON.stringify({ mode: 'sync' }))

  delete globalThis.settings
  assert.equal(notification.__calls.length, 0)
  const store = storage.__stores().get('aibolit-data.json')
  assert.equal(store.get('configRevision'), 2)
  assert.deepEqual(store.get('medications'), [{ id: 'm2', name: 'Ибупрофен', enabled: true }])
})

test('mode sync игнорирует intakeId', () => {
  serviceOpts.onInit(JSON.stringify({ mode: 'sync', intakeId: 'i1' }))
  assert.equal(notification.__calls.length, 0)
})
```

- [ ] **Step 2: Запустить тест и убедиться, что падает**

Run (из `src`): `node --test test/reminder-service.test.js`
Expected: FAIL — `mode sync` не обрабатывается, уходит в ветку с уведомлением.

- [ ] **Step 3: Реализовать обработку `mode:'sync'` в `src/app-service/reminder.js`**

Полное новое содержимое файла:

```js
import { log as Logger } from '@zos/utils'
import { notify } from '@zos/notification'
import { getSettings, getIntakes, getMedications, getTakeLogs, isIntakeCancelled, getTodayDateStr } from '../utils/storage'
import { createRetryAlarm, refreshAlarms } from '../utils/schedule'
import { ALARM_MODES } from '../utils/constants'
import { buildItemsSummary } from '../utils/intake-logic.js'
import { retrySync } from '../utils/sync'
import { applyConfigFromSettings } from '../utils/watch-config'

const logger = Logger.getLogger('aibolit-reminder')

function handleEvent(e) {
  logger.log('reminder handleEvent: ' + e)

  let params
  try {
    params = JSON.parse(e)
  } catch (err) {
    logger.log('Failed to parse event params: ' + e)
    return
  }

  const { mode, intakeId } = params

  if (mode === ALARM_MODES.SYNC) {
    logger.log('sync tick: apply config, refresh alarms, retry queue')
    applyConfigFromSettings()
    refreshAlarms()
    retrySync()
    return
  }

  if (!intakeId) return

  const intake = getIntakes().find(i => i.id === intakeId)
  if (!intake) return

  const todayDateStr = getTodayDateStr()

  if (isIntakeCancelled(intakeId, todayDateStr)) return

  const takeLogs = getTakeLogs()
  const alreadyTaken = takeLogs.some(i => i.intakeId === intakeId && i.date === todayDateStr && i.status === 'taken')
  if (alreadyTaken) return

  const title = 'Пора принимать лекарства'
  const content = buildItemsSummary(intake.items || [], getMedications()) || 'Примите лекарство'

  notify({
    title: title,
    content: content,
    vibrate: 1,
    actions: [
      {
        text: 'Принял',
        file: 'page/take/index',
        param: JSON.stringify({ intakeId }),
      },
      {
        text: 'Отложить',
        file: 'page/snooze/index',
        param: JSON.stringify({ intakeId }),
      },
    ],
  })

  if (mode === ALARM_MODES.REMINDER) {
    const settings = getSettings()
    createRetryAlarm(intakeId, settings.retryInterval)
  }

  logger.log('Notification sent for ' + title)
}

AppService({
  onInit(e) {
    logger.log('reminder onInit(' + e + ')')
    handleEvent(e)
  },

  onEvent(e) {
    logger.log('reminder onEvent: ' + e)
    handleEvent(e)
  },

  onDestroy() {
    logger.log('reminder onDestroy')
  },
})
```

- [ ] **Step 4: Запустить тесты**

Run (из `src`): `node --test test/reminder-service.test.js`
Expected: `pass 7` / `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/app-service/reminder.js src/test/reminder-service.test.js
git commit -m "feat: handle background sync tick mode in reminder service"
```

---

### Task 7: Интеграция — app.js, полный прогон тестов и сборка

**Files:**
- Verify: `src/app.js`
- none (верификация)

- [ ] **Step 1: Проверить, что `app.js` не требует изменений**

Текущий `src/app.js` уже вызывает `refreshAlarms()` в `onCreate`, `onCall(CONFIG_SYNCED)` и после `syncConfig()` — а значит и пересоздание sync-alarm. `retrySync()` в `onCreate` уже есть. Ничего менять не нужно.

- [ ] **Step 2: Запустить все тесты**

Run (из `src`): `node --test`
Expected: `fail 0` (все существующие + новые тесты проходят; суммарное число тестов ~141).

- [ ] **Step 3: Сборка пакета**

> **Известная предсуществующая проблема:** `zeus build` (PROD) падает и в `main`, и в этой ветке на тестовых файлах (`src/test/*.test.js`) с top-level `await` — esbuild transform с target es2015 не поддерживает top-level await, а zeus включает в PROD-сборку все `**/*.js` из `src`. Это НЕ связано с данной задачей (воспроизводится на `main`, напр. `text-wrap.test.js`).

Рабочий путь сборки проекта — `zeus preview` (dev/preview режим; так собирается и существующий дистрибутив). Запустить:

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" preview --target "Amazfit Balance 2"`
Expected: сборка без ошибок, создан `.zab` в `src/dist`, показан QR-код превью.

- [ ] **Step 4: Smoke-проверка**

Run (из корня репозитория):
`git grep -n "configRevision" -- "src/**/*.js"`
Expected: `src/app-side/index.js`, `src/utils/watch-config.js`, `src/utils/storage.js`.

Run (из корня репозитория):
`git grep -n "createSyncAlarm\|mode: ALARM_MODES.SYNC\|ALARM_MODES.SYNC" -- "src/**/*.js"`
Expected: `src/utils/schedule.js`, `src/app-service/reminder.js`.

- [ ] **Step 5: Ручная проверка сценария (устройство/эмулятор)**

Run: `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" preview --target "Amazfit Balance 2"` из `src` (dev-сборка; `zeus build` PROD предсущественно ломается на тестах — см. Step 3).

Проверить:
1. Изменить расписание/настройки в companion при **закрытом** приложении на часах → в течение `syncInterval` будильники пересоздаются, новые настройки применяются.
2. Быстро отметить «принял» для двух приёмов подряд → на телефоне в истории нет дубликатов.
3. Отменить приём (long-press) при оборванной связи → после восстановления связи отмена доходит до телефона.
4. Открыть приложение на часах → настройки соответствуют телефону (ревизия не откатывает).
5. **Sync-alarm на устройстве (важно, unit-тесты это не покрывают):**
   - Проверить в логах, что `createSyncAlarm` создал alarm с валидным `id > 0` (не 0 — иначе alarm не создан из-за отсутствия `time`).
   - Замерить фактический интервал срабатывания фонового тика. По `@zeppos/device-types` период `REPEAT_MINUTE` = `repeat_period + repeat_duration` (док-пример REPEAT_DAY 20+1 = «every 21 days»), т.е. эффективный интервал сейчас `syncInterval + 1` минута. Если подтвердится — поправить `repeat_period` на `interval - 1` в `createSyncAlarm` и обновить тест `schedule.test.js`.

- [ ] **Step 6: Commit при изменениях по итогам проверки**

```bash
git add -A
git commit -m "fix: adjustments after sync-reliability verification"
```
