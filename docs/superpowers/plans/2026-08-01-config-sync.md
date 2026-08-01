# Доставка конфигурации из companion на часы — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Доставлять конфигурацию (medications, intakes, settings) из companion-настроек на телефон в `ShareLocalStorage` часов через app-side `onSettingsChange`, с live-уведомлением watch-приложения и подключением `refreshAlarms()`.

**Architecture:** Companion пишет в `settings.settingsStorage` (уже так); app-side ловит `onSettingsChange` по ключам из `CONFIG_KEYS`, парсит значения (`parseSettingsItem`), пишет объекты в `ShareLocalStorage('aibolit-data.json')` и шлёт `this.call({method: CONFIG_SYNCED})`; watch-приложение в `onCall` и `onCreate` вызывает `refreshAlarms()`. Спека: `docs/superpowers/specs/2026-08-01-config-sync-design.md`.

**Tech Stack:** ZeppOS 4.2, `@zeppos/zml`, `@zos/storage`, `@zos/alarm`, Node 24 (`node:test`) для unit-тестов.

**Testing note:** Запуск тестов — `node --test` из `src` (bare; форма с аргументом-каталогом падает на Node 24/Windows). Сборка — `zeus build -t "Amazfit Balance 2"` из `src`.

---

### Task 1: Константа `CONFIG_SYNCED` (`src/utils/constants.js`)

**Files:**
- Modify: `src/utils/constants.js`

- [ ] **Step 1: Добавить метод в `ZML_METHODS`**

В `src/utils/constants.js` заменить блок `ZML_METHODS` на:

```js
export const ZML_METHODS = {
  SYNC_INTAKE: 'sync_intake',
  SYNC_CANCELLATION: 'sync_cancellation',
  UNDO_TAKE: 'undo_take',
  RESTORE_INTAKE: 'restore_intake',
  CONFIG_SYNCED: 'config_synced',
}
```

Остальное в файле не меняется.

- [ ] **Step 2: Проверить тесты и сборку**

Run (из `src`): `node --test`
Expected: `pass 13` / `fail 0`.

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: сборка без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/utils/constants.js
git commit -m "feat: add CONFIG_SYNCED zml method"
```

---

### Task 2: Модуль `src/utils/config-sync.js` (TDD)

**Files:**
- Create: `src/utils/config-sync.js`
- Create: `src/test/config-sync.test.js`

- [ ] **Step 1: Написать падающий тест**

Создать `src/test/config-sync.test.js` (инструментом Write):

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG_KEYS, parseSettingsItem } from '../utils/config-sync.js'

test('CONFIG_KEYS contains the three config keys', () => {
  assert.deepEqual(CONFIG_KEYS, ['medications', 'intakes', 'settings'])
})

test('parseSettingsItem parses JSON string to object', () => {
  assert.deepEqual(parseSettingsItem('[{"id":"m1"}]'), [{ id: 'm1' }])
  assert.deepEqual(parseSettingsItem('{"retryInterval":60}'), { retryInterval: 60 })
})

test('parseSettingsItem returns object as-is', () => {
  const obj = { retryInterval: 60 }
  assert.equal(parseSettingsItem(obj), obj)
})

test('parseSettingsItem returns null for null and undefined', () => {
  assert.equal(parseSettingsItem(null), null)
  assert.equal(parseSettingsItem(undefined), null)
})

test('parseSettingsItem returns null for invalid JSON string', () => {
  assert.equal(parseSettingsItem('not json'), null)
})
```

- [ ] **Step 2: Запустить и убедиться, что падает**

Run (из `src`): `node --test test/config-sync.test.js`
Expected: FAIL — `Cannot find module '../utils/config-sync.js'`.

- [ ] **Step 3: Реализовать модуль**

Создать `src/utils/config-sync.js` (инструментом Write):

```js
export const CONFIG_KEYS = ['medications', 'intakes', 'settings']

export function parseSettingsItem(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch (e) {
    return null
  }
}
```

- [ ] **Step 4: Запустить тесты**

Run (из `src`): `node --test test/config-sync.test.js`
Expected: `pass 5` / `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/utils/config-sync.js src/test/config-sync.test.js
git commit -m "feat: add config-sync helpers with unit tests"
```

---

### Task 3: App-side — доставка конфигурации (`src/app-side/index.js`)

**Files:**
- Modify: `src/app-side/index.js`

- [ ] **Step 1: Полное новое содержимое файла**

Заменить содержимое `src/app-side/index.js` на:

```js
import { BaseSideService } from '@zeppos/zml/base-side'
import { ShareLocalStorage } from '@zos/storage'
import { ZML_METHODS } from '../utils/constants'
import { CONFIG_KEYS, parseSettingsItem } from '../utils/config-sync'

const configStorage = new ShareLocalStorage('aibolit-data.json')

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
        this.pushConfigToWatch()
      }
    },

    pushConfigToWatch() {
      for (const key of CONFIG_KEYS) {
        const raw = this.settings.getItem(key)
        const value = parseSettingsItem(raw)
        if (value !== null) {
          configStorage.setItem(key, value)
        }
      }
      this.call({ method: ZML_METHODS.CONFIG_SYNCED, params: {} })
      console.log('Config pushed to watch storage')
    },

    onRequest(req, res) {
      console.log(`onRequest method: ${req.method}`)

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
        const { intakeId, date } = req.params
        const dateKey = `history_${date}`
        const existing = settings.settingsStorage.getItem(dateKey)
        const history = existing ? JSON.parse(existing) : []
        history.push({
          intakeId,
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
      console.log(`onCall method: ${data.method}`)
    },
  })
)
```

- [ ] **Step 2: Проверить тесты и сборку**

Run (из `src`): `node --test`
Expected: `pass 18` / `fail 0`.

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: сборка без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/app-side/index.js
git commit -m "feat: push config from companion to watch storage via side service"
```

---

### Task 4: Watch-приложение — приём уведомления и refresh алarmов (`src/app.js`)

**Files:**
- Modify: `src/app.js`

- [ ] **Step 1: Полное новое содержимое файла**

Заменить содержимое `src/app.js` на:

```js
import { BaseApp } from '@zeppos/zml/base-app'
import { log as Logger } from '@zos/utils'
import { refreshAlarms } from './utils/schedule'
import { ZML_METHODS } from './utils/constants'

const logger = Logger.getLogger('aibolit-app')

App(
  BaseApp({
    globalData: {},
    onCreate() {
      logger.log('app onCreate invoked')
      refreshAlarms()
    },
    onCall(data) {
      logger.log(`app onCall method: ${data && data.method}`)
      if (data && data.method === ZML_METHODS.CONFIG_SYNCED) {
        refreshAlarms()
      }
    },
    onDestroy() {
      logger.log('app onDestroy invoked')
    }
  })
)
```

- [ ] **Step 2: Проверить тесты и сборку**

Run (из `src`): `node --test`
Expected: `pass 18` / `fail 0`.

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: сборка без ошибок.

- [ ] **Step 3: Commit**

```bash
git add src/app.js
git commit -m "feat: refresh alarms on config sync and app start"
```

---

### Task 5: Финальная проверка

**Files:**
- none (верификация)

- [ ] **Step 1: Запустить все тесты**

Run (из `src`): `node --test`
Expected: `pass 18` / `fail 0`.

- [ ] **Step 2: Полная сборка**

Run (из `src`): `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" build -t "Amazfit Balance 2"`
Expected: `[QJSC] Compiling JS files... done!` без ошибок.

- [ ] **Step 3: Smoke-проверка**

Run (из корня репозитория): `git grep -n "refreshAlarms" -- "src/**/*.js"`
Expected: вхождение в `src/app.js` (вызовы) и в `src/utils/schedule.js` (определение). Больше нигде не должно быть вызова (дублирования нет).

Run (из корня репозитория): `git grep -n "configStorage\|pushConfigToWatch\|CONFIG_SYNCED" -- "src/**/*.js"`
Expected: `configStorage`/`pushConfigToWatch` — только в `src/app-side/index.js`; `CONFIG_SYNCED` — в `src/utils/constants.js` и `src/app.js`/`src/app-side/index.js`.

- [ ] **Step 4: Ручная проверка сценария (устройство/эмулятор)**

Run: `& "C:\Users\pserg\AppData\Roaming\npm\zeus.cmd" preview --target "Amazfit Balance 2"` из `src`.

Проверить:
1. В companion создать лекарства и приём.
2. Открыть приложение на часах → приём отображается на home/plan; алarm создан (уведомление в нужное время).
3. При открытом приложении на часах изменить приём в companion → приём на часах обновляется «живьём» (live).
4. История приёма (take/undo) по-прежнему синхронизируется на телефон.

- [ ] **Step 5: Commit при изменениях по итогам проверки**

```bash
git add -A
git commit -m "fix: adjustments after config-sync verification"
```

---
