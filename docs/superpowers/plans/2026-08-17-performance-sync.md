# Оптимизация производительности (синхронизация без навигации) — план реализации

> **Для агентных исполнителей:** ТРЕБУЕТСЯ ПОДСKILL: используйте
> superpowers:subagent-driven-development (рекомендуется) или
> superpowers:executing-plans для пошаговой реализации. Шаги используют
> чекбоксы (`- [ ]`) для отслеживания.

**Цель:** Убрать сетевые запросы к телефону (`get_config`, `get_take_logs`) из
навигации между экранами «Сегодня» и «План дня», оставив синхронизацию только
при старте приложения, по фоновому sync-тамеру и по push-уведомлению; сделать
старт неблокирующим.

**Архитектура:** Новый модуль `data-events.js` — локальная шина событий «данные
изменились». Новый модуль `sync-all.js` — оркестратор фоновой синхронизации
(`fetchConfigFromSide` → `refreshAlarms` при применении → `fetchTakesFromPhone`
→ `mergeTakeRecords`). Страницы home/plan подписываются на шину вместо вызова
сетевых запросов в `build()`. `fetchConfigFromSide` начинает возвращать факт
применения конфига, а не факт получения ответа.

**Технологии:** Zepp OS (ZML), easy-storage, node:test (стабы `@zos/*` через
`test/helpers/zos-loader.mjs`), ES-модули без точки с запятой.

**Команда для тестов (из каталога `src/`):**
`node --test test/<файл>.test.js` — один файл, `npm test` — все тесты.

---

## Обзор файлов

| Файл | Действие | Ответственность |
|------|----------|-----------------|
| `src/utils/data-events.js` | создать | Шина событий «данные изменились» |
| `src/utils/sync-all.js` | создать | Оркестратор фоновой синхронизации `syncFromPhone` |
| `src/utils/watch-config.js` | изменить | `fetchConfigFromSide` возвращает «применено»; эмит события при применении |
| `src/utils/sync.js` | изменить | `mergeTakeRecords` эмитит событие при изменении |
| `src/app.js` | изменить | Лёгкий `onCreate`, единая точка синхронизации, удалить `syncConfig` |
| `src/app-service/reminder.js` | изменить | sync-тик через `syncFromPhone` |
| `src/page/home/index.js` | изменить | Подписка на данные вместо сетевых запросов в `build()` |
| `src/page/plan/index.js` | изменить | Подписка на данные вместо сетевых запросов в `build()` |
| `src/test/data-events.test.js` | создать | Тесты шины + эмит из источников |
| `src/test/sync-all.test.js` | создать | Тесты `syncFromPhone` |
| `src/test/app.test.js` | изменить | Переписать под новый `onCreate`/`onCall` |
| `src/test/watch-config.test.js` | изменить | Тесты новой семантики `fetchConfigFromSide` |
| `src/test/reminder-service.test.js` | изменить | Адаптация fakeSide под `get_take_logs` |
| `src/test/home-page-render.test.js` | изменить | Тесты «build не ходит в сеть» и подписки |
| `src/test/plan-page-render.test.js` | изменить | Тесты «build не ходит в сеть» и подписки |

---

### Задача 1: Модуль шины событий `data-events.js`

**Файлы:**
- Создать: `src/utils/data-events.js`
- Тест: `src/test/data-events.test.js`

- [ ] **Шаг 1: написать падающий тест**

Создать `src/test/data-events.test.js`:

```js
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const storage = await import('./helpers/stubs/zos-storage.mjs')
const fs = await import('./helpers/stubs/zos-fs.mjs')
const { subscribeToData, emitDataChanged } = await import('../utils/data-events.js')

function seed() {
  storage.__resetStorage()
  fs.__resetFs()
  new storage.LocalStorage('aibolit-data.json')
}

beforeEach(() => {
  seed()
})

test('подписка: эмит вызывает слушателя', () => {
  let called = 0
  const off = subscribeToData(() => { called++ })
  emitDataChanged()
  assert.equal(called, 1)
  off()
})

test('отписка: после off эмит не вызывает слушателя', () => {
  let called = 0
  const off = subscribeToData(() => { called++ })
  off()
  emitDataChanged()
  assert.equal(called, 0)
})

test('ошибка в одном слушателе не ломает остальных', () => {
  const calls = []
  const off1 = subscribeToData(() => { throw new Error('boom') })
  const off2 = subscribeToData(() => { calls.push('ok') })
  emitDataChanged()
  assert.deepEqual(calls, ['ok'])
  off1()
  off2()
})
```

- [ ] **Шаг 2: прогнать и убедиться, что падает**

Из `src/`:
`node --test test/data-events.test.js`

Ожидание: FAIL с ошибкой импорта (`ERR_MODULE_NOT_FOUND` для
`../utils/data-events.js`).

- [ ] **Шаг 3: реализовать модуль**

Создать `src/utils/data-events.js`:

```js
const listeners = new Set()

export function subscribeToData(fn) {
  if (typeof fn !== 'function') return () => {}
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function emitDataChanged() {
  for (const fn of Array.from(listeners)) {
    try {
      fn()
    } catch (e) {
      // ошибка слушателя не должна прерывать остальных
    }
  }
}
```

- [ ] **Шаг 4: прогнать и убедиться, что проходит**

Из `src/`:
`node --test test/data-events.test.js`

Ожидание: PASS, 3 теста зелёные.

- [ ] **Шаг 5: коммит**

```bash
git add src/utils/data-events.js src/test/data-events.test.js
git commit -m "feat: шина событий данных data-events (подписка на изменение данных)"
```

---

### Задача 2: эмит события из источников данных

**Файлы:**
- Изменить: `src/utils/watch-config.js`
- Изменить: `src/utils/sync.js`
- Тест: `src/test/data-events.test.js`

- [ ] **Шаг 1: добавить падающие тесты**

Дописать в конец `src/test/data-events.test.js` перед закрывающей скобкой файла
(импорты `applyConfigToStorage`, `applyConfigFromSettings`, `mergeTakeRecords` —
через `await import` внутри тестов, чтобы избежать раннего импорта тяжёлых
модулей):

```js
test('applyConfigToStorage эмитит событие при применении', async () => {
  const { applyConfigToStorage } = await import('../utils/watch-config.js')
  let called = 0
  const off = subscribeToData(() => { called++ })
  try {
    const applied = applyConfigToStorage({ revision: 5, medications: [{ id: 'm1' }] })
    assert.equal(applied, true)
    assert.equal(called, 1)
  } finally {
    off()
  }
})

test('applyConfigToStorage не эмитит при старой ревизии', async () => {
  const { applyConfigToStorage } = await import('../utils/watch-config.js')
  applyConfigToStorage({ revision: 5, medications: [{ id: 'm1' }] })
  let called = 0
  const off = subscribeToData(() => { called++ })
  try {
    applyConfigToStorage({ revision: 4, medications: [{ id: 'm2' }] })
    assert.equal(called, 0)
  } finally {
    off()
  }
})

test('applyConfigFromSettings эмитит событие при применении', async () => {
  const { applyConfigFromSettings } = await import('../utils/watch-config.js')
  globalThis.settings = {
    settingsStorage: {
      getItem(key) {
        const map = { configRevision: '3', medications: JSON.stringify([{ id: 'm1' }]) }
        return map[key] !== undefined ? map[key] : null
      },
    },
  }
  let called = 0
  const off = subscribeToData(() => { called++ })
  try {
    const applied = applyConfigFromSettings()
    assert.equal(applied, true)
    assert.equal(called, 1)
  } finally {
    off()
    delete globalThis.settings
  }
})

test('mergeTakeRecords эмитит событие при добавлении записей', async () => {
  const { mergeTakeRecords } = await import('../utils/sync.js')
  let called = 0
  const off = subscribeToData(() => { called++ })
  try {
    const changed = mergeTakeRecords([{ id: 'log_1', intakeId: 'i1', status: 'taken' }])
    assert.equal(changed, true)
    assert.equal(called, 1)
  } finally {
    off()
  }
})

test('mergeTakeRecords не эмитит при пустом списке', async () => {
  const { mergeTakeRecords } = await import('../utils/sync.js')
  let called = 0
  const off = subscribeToData(() => { called++ })
  try {
    mergeTakeRecords([])
    assert.equal(called, 0)
  } finally {
    off()
  }
})
```

- [ ] **Шаг 2: прогнать и убедиться, что падает**

Из `src/`:
`node --test test/data-events.test.js`

Ожидание: 5 новых тестов FAIL (событие не эмитится).

- [ ] **Шаг 3: реализовать эмит**

В `src/utils/watch-config.js`:

1. Добавить импорт после строки `import { addDebugEntry } from './debug-log'`:

```js
import { emitDataChanged } from './data-events'
```

2. В `applyConfigToStorage` после `setConfigRevision(config.revision)` (строка 38)
добавить:

```js
  emitDataChanged()
```

3. В `applyConfigFromSettings` внутри блока `if (applied)` после
`addDebugEntry(...)` (строка 95) добавить:

```js
    emitDataChanged()
```

В `src/utils/sync.js`:

1. Добавить импорт после строки `import { log as Logger } from '@zos/utils'`:

```js
import { emitDataChanged } from './data-events'
```

2. В `mergeTakeRecords` после `setTakeLogs(takeLogs)` (строка 56) добавить:

```js
    emitDataChanged()
```

- [ ] **Шаг 4: прогнать и убедиться, что проходит**

Из `src/`:
`node --test test/data-events.test.js`

Ожидание: PASS, все тесты зелёные.

- [ ] **Шаг 5: коммит**

```bash
git add src/utils/watch-config.js src/utils/sync.js src/test/data-events.test.js
git commit -m "feat: эмит события data-changed при применении конфига и слиянии take-логов"
```

---

### Задача 3: `fetchConfigFromSide` возвращает факт применения

**Файлы:**
- Изменить: `src/utils/watch-config.js`
- Тест: `src/test/watch-config.test.js`

- [ ] **Шаг 1: добавить падающие тесты**

Дописать в конец `src/test/watch-config.test.js`:

```js
test('fetchConfigFromSide возвращает false, когда конфиг получен, но не применён (старая ревизия)', async () => {
  applyConfigToStorage({ revision: 5, medications: [{ id: 'm1' }] })
  globalThis.getApp = () => ({
    _options: {
      globalData: {
        messaging: {
          request() {
            return Promise.resolve({ config: { revision: 4, medications: [{ id: 'm2' }] } })
          },
        },
      },
    },
  })

  const result = await fetchConfigFromSide(undefined, 1, 1)

  delete globalThis.getApp
  assert.equal(result, false)
  assert.deepEqual(store().get('medications'), [{ id: 'm1' }])
})

test('fetchConfigFromSide при неудачном запросе ретраит и применяет свежую конфигурацию', async () => {
  const store = storage.__stores().get('aibolit-data.json')
  store.set('configRevision', 3)
  let attempt = 0
  globalThis.getApp = () => ({
    _options: {
      globalData: {
        messaging: {
          request() {
            attempt++
            if (attempt === 1) return Promise.reject(new Error('offline'))
            return Promise.resolve({ config: { revision: 4, medications: [{ id: 'm2' }] } })
          },
        },
      },
    },
  })

  const result = await fetchConfigFromSide(undefined, 2, 10)

  delete globalThis.getApp
  assert.equal(result, true)
  assert.deepEqual(store.get('medications'), [{ id: 'm2' }])
  assert.equal(store.get('configRevision'), 4)
})
```

- [ ] **Шаг 2: прогнать и убедиться, что падает**

Из `src/`:
`node --test test/watch-config.test.js`

Ожидание: первый новый тест FAIL (сейчас возвращается `true` при полученном,
но не применённом конфиге). Второй может пройти частично — верно проверить
первый.

- [ ] **Шаг 3: реализовать**

В `src/utils/watch-config.js` в `fetchConfigFromSide` заменить строку
`resolve(!!(result && result.config))` на:

```js
          resolve(applyConfigToStorage(result && result.config))
```

- [ ] **Шаг 4: прогнать и убедиться, что проходит**

Из `src/`:
`node --test test/watch-config.test.js`

Ожидание: PASS, все тесты (включая существующие) зелёные.

- [ ] **Шаг 5: коммит**

```bash
git add src/utils/watch-config.js src/test/watch-config.test.js
git commit -m "feat: fetchConfigFromSide возвращает факт применения конфига, а не факт ответа"
```

---

### Задача 4: оркестратор `sync-all.js` с `syncFromPhone`

**Файлы:**
- Создать: `src/utils/sync-all.js`
- Тест: `src/test/sync-all.test.js`

- [ ] **Шаг 1: написать падающие тесты**

Создать `src/test/sync-all.test.js`:

```js
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const storage = await import('./helpers/stubs/zos-storage.mjs')
const fs = await import('./helpers/stubs/zos-fs.mjs')
const alarm = await import('./helpers/stubs/zos-alarm.mjs')
const { initSync } = await import('../utils/sync.js')
const { syncFromPhone } = await import('../utils/sync-all.js')

function seed() {
  storage.__resetStorage()
  fs.__resetFs()
  new storage.LocalStorage('aibolit-data.json')
  const meds = [{ id: 'm1', name: 'Аспирин', enabled: true }]
  const intakes = [{ id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] }]
  storage.__stores().get('aibolit-data.json').set('medications', meds)
  storage.__stores().get('aibolit-data.json').set('intakes', intakes)
}

beforeEach(() => {
  seed()
  initSync(null)
  alarm.__reset()
})

function fakeSideWith(sent, revision, hasRecords) {
  return {
    request(payload) {
      sent.push(payload)
      if (payload.method === 'get_config') {
        return Promise.resolve({
          config: {
            revision,
            medications: [{ id: 'm1', name: 'Аспирин', enabled: true }],
            intakes: [{ id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] }],
            settings: { minFontSize: 16 },
          },
        })
      }
      if (payload.method === 'get_take_logs') {
        return Promise.resolve({ records: hasRecords ? [{ id: 'log_x', intakeId: 'i1', date: '2026-08-17', status: 'taken' }] : [] })
      }
      return Promise.resolve({ success: true, count: 0 })
    },
  }
}

test('syncFromPhone запрашивает get_config и get_take_logs', async () => {
  const sent = []
  initSync(fakeSideWith(sent, 9, false))

  await syncFromPhone('при старте')

  assert.ok(sent.some(p => p.method === 'get_config'))
  assert.ok(sent.some(p => p.method === 'get_take_logs'))
})

test('syncFromPhone при применённом конфиге перестраивает будильники', async () => {
  const sent = []
  initSync(fakeSideWith(sent, 9, false))

  await syncFromPhone('при старте')

  const sets = alarm.__getCalls().filter(c => c.method === 'set')
  assert.ok(sets.length > 0, 'refreshAlarms должен создать будильники')
  assert.ok(sets.some(c => JSON.parse(c.option.param).mode === 'sync'), 'создан sync-alarm')
})

test('syncFromPhone не перестраивает будильники, когда конфиг не применён', async () => {
  const store = storage.__stores().get('aibolit-data.json')
  store.set('configRevision', 10)
  const sent = []
  initSync(fakeSideWith(sent, 9, false))

  await syncFromPhone('при старте')

  assert.equal(alarm.__getCalls().length, 0, 'refreshAlarms не вызывается при нетронутом конфиге')
})

test('syncFromPhone применяет take-логи с телефона', async () => {
  const sent = []
  initSync(fakeSideWith(sent, 9, true))

  await syncFromPhone('при старте')

  const logs = storage.__stores().get('aibolit-data.json').get('takeLogs')
  assert.ok(logs.some(i => i.id === 'log_x'))
})

test('syncFromPhone не бросает исключений при обрыве связи', async () => {
  initSync({
    request() {
      throw new Error('ble down')
    },
  })

  const result = await syncFromPhone('при старте')
  assert.equal(result, undefined)
})
```

- [ ] **Шаг 2: прогнать и убедиться, что падает**

Из `src/`:
`node --test test/sync-all.test.js`

Ожидание: FAIL с ошибкой импорта (`ERR_MODULE_NOT_FOUND` для
`../utils/sync-all.js`).

- [ ] **Шаг 3: реализовать**

Создать `src/utils/sync-all.js`:

```js
import { fetchConfigFromSide } from './watch-config'
import { fetchTakesFromPhone, mergeTakeRecords } from './sync'
import { refreshAlarms } from './schedule'
import { getTodayDateStr } from './storage'

export function syncFromPhone(source = '') {
  return fetchConfigFromSide(source)
    .then((applied) => {
      if (applied) refreshAlarms()
      return fetchTakesFromPhone(getTodayDateStr()).then((records) => {
        mergeTakeRecords(records)
      })
    })
    .catch(() => {})
}
```

- [ ] **Шаг 4: прогнать и убедиться, что проходит**

Из `src/`:
`node --test test/sync-all.test.js`

Ожидание: PASS, все тесты зелёные.

- [ ] **Шаг 5: коммит**

```bash
git add src/utils/sync-all.js src/test/sync-all.test.js
git commit -m "feat: syncFromPhone — единая фоновая синхронизация конфига и take-логов"
```

---

### Задача 5: `app.js` — лёгкий старт и единая точка синхронизации

**Файлы:**
- Изменить: `src/app.js`
- Тест: `src/test/app.test.js`

- [ ] **Шаг 1: переписать тесты**

Заменить содержимое `src/test/app.test.js` на:

```js
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let appOpts = null
globalThis.App = (opts) => { appOpts = opts }

const storage = await import('./helpers/stubs/zos-storage.mjs')
const fs = await import('./helpers/stubs/zos-fs.mjs')
const sync = await import('../utils/sync.js')

await import('../app.js')

function seed() {
  storage.__resetStorage()
  fs.__resetFs()
  new storage.LocalStorage('aibolit-data.json')
  sync.initSync(null)
  delete globalThis.getApp
}

beforeEach(() => {
  seed()
})

test('onCall CONFIG_SYNCED запрашивает свежий конфиг с телефона вместо применения payload', async () => {
  const sent = []
  sync.initSync({
    request(payload) {
      sent.push(payload)
      if (payload.method === 'get_config') return Promise.resolve({ config: { revision: 9, medications: [], intakes: [] } })
      if (payload.method === 'get_take_logs') return Promise.resolve({ records: [] })
      return Promise.resolve({ success: true, count: 0 })
    },
  })

  appOpts.onCall({ method: 'config_synced', params: { config: { revision: 99, medications: [] } } })
  await new Promise((resolve) => setTimeout(resolve, 10))

  assert.ok(sent.some(p => p.method === 'get_config'), 'уведомление запускает запрос конфига')
  const store = storage.__stores().get('aibolit-data.json')
  assert.equal(store.get('configRevision'), 9, 'применён конфиг из ответа, а не из payload')
})

test('onCall CONFIG_SYNCED пишет в отладочный лог при включённой отладке', async () => {
  const store = storage.__stores().get('aibolit-data.json')
  store.set('settings', { debugMode: true })
  sync.initSync({ request: () => Promise.resolve({ config: { revision: 9 } }) })

  appOpts.onCall({ method: 'config_synced' })
  await new Promise((resolve) => setTimeout(resolve, 10))

  const log = store.get('debugLog')
  assert.ok(log.some(e => e.message.includes('получено уведомление об изменении настроек с телефона')))
})

test('onCall CLEAR_DEBUG очищает отладочный лог на часах', () => {
  const store = storage.__stores().get('aibolit-data.json')
  store.set('settings', { debugMode: true })
  store.set('debugLog', [{ ts: 1, message: 'старое' }])

  appOpts.onCall({ method: 'clear_debug' })

  assert.deepEqual(store.get('debugLog'), [])
})

test('onCreate запускает фоновую синхронизацию (get_config и get_take_logs)', async () => {
  const sent = []
  const fakeSide = {
    request(payload) {
      sent.push(payload)
      if (payload.method === 'get_config') return Promise.resolve({ config: { revision: 9, medications: [], intakes: [] } })
      if (payload.method === 'get_take_logs') return Promise.resolve({ records: [] })
      return Promise.resolve({ success: true, count: 0 })
    },
  }

  appOpts.onCreate.call({ globalData: { messaging: fakeSide } })
  await new Promise((resolve) => setTimeout(resolve, 20))

  assert.ok(sent.some(p => p.method === 'get_config'), 'onCreate запрашивает конфиг')
  assert.ok(sent.some(p => p.method === 'get_take_logs'), 'onCreate запрашивает take-логи')
})
```

- [ ] **Шаг 2: прогнать и убедиться, что падает**

Из `src/`:
`node --test test/app.test.js`

Ожидание: FAIL (метод `syncConfig` ещё существует в старом `app.js`; тесты
на `onCreate` падают из-за отсутствия фоновой синхронизации).

- [ ] **Шаг 3: реализовать `app.js`**

Заменить содержимое `src/app.js` на:

```js
import { BaseApp } from '@zeppos/zml/base-app'
import { appPlugin } from '@zeppos/zml/3.0/module/messaging/plugin/app'
import { log as Logger } from '@zos/utils'
import { refreshAlarms } from './utils/schedule'
import { applyConfigFromSettings } from './utils/watch-config'
import { ZML_METHODS } from './utils/constants'
import { initSync, retrySync } from './utils/sync'
import { syncFromPhone } from './utils/sync-all'
import { pushDebugSnapshot, addDebugEntry, clearDebugLog } from './utils/debug-log'
import { saveAndQuit } from './utils/storage'

const logger = Logger.getLogger('aibolit-app')

BaseApp.use(appPlugin)

App(
  BaseApp({
    globalData: {},
    onCreate() {
      logger.log('app onCreate invoked')
      initSync(this.globalData && this.globalData.messaging)
      retrySync()
      if (applyConfigFromSettings()) {
        logger.log('config applied from settings on create')
      }
      const runSync = () => {
        refreshAlarms()
        syncFromPhone('при старте')
      }
      if (typeof setTimeout === 'function') {
        setTimeout(runSync, 0)
      } else {
        runSync()
      }
    },
    onCall(data) {
      logger.log(`app onCall method: ${data && data.method}`)
      if (data && data.method === ZML_METHODS.CONFIG_SYNCED) {
        addDebugEntry('получено уведомление об изменении настроек с телефона')
        syncFromPhone('уведомление')
      }
      if (data && data.method === ZML_METHODS.REQUEST_DEBUG) {
        pushDebugSnapshot()
      }
      if (data && data.method === ZML_METHODS.CLEAR_DEBUG) {
        clearDebugLog()
      }
    },
    onDestroy() {
      logger.log('app onDestroy invoked')
      saveAndQuit()
    }
  })
)
```

- [ ] **Шаг 4: прогнать и убедиться, что проходит**

Из `src/`:
`node --test test/app.test.js`

Ожидание: PASS, все тесты зелёные.

- [ ] **Шаг 5: коммит**

```bash
git add src/app.js src/test/app.test.js
git commit -m "refactor: лёгкий onCreate и единая точка синхронизации через syncFromPhone"
```

---

### Задача 6: sync-тик в `reminder.js` через `syncFromPhone`

**Файлы:**
- Изменить: `src/app-service/reminder.js`
- Тест: `src/test/reminder-service.test.js`

- [ ] **Шаг 1: адаптировать существующий тест**

В `src/test/reminder-service.test.js` в тесте
`mode sync применяет настройки, обновляет будильники и ретраит очередь без уведомления`
заменить `initSync({...})` так, чтобы fakeSide корректно отвечал на `get_take_logs`
(иначе синхронный `TypeError` внутри `request` перехватывается только в
`syncFromPhone`, что безвредно, но загрязняет тест). Заменить блок:

```js
  const sent = []
  syncModule.initSync({
    request(payload) {
      sent.push(payload)
      return Promise.resolve({ success: true, count: payload.params.records.length })
    },
  })
```

на:

```js
  const sent = []
  syncModule.initSync({
    request(payload) {
      sent.push(payload)
      if (payload.method === 'get_take_logs') return Promise.resolve({ records: [] })
      return Promise.resolve({ success: true, count: (payload.params && payload.params.records) ? payload.params.records.length : 0 })
    },
  })
```

- [ ] **Шаг 2: прогнать тесты reminder до изменений реализации**

Из `src/`:
`node --test test/reminder-service.test.js`

Ожидание: PASS (существующие тесты совместимы с новым `syncFromPhone` уже
сейчас — он вызывает те же функции).

- [ ] **Шаг 3: реализовать `reminder.js`**

В `src/app-service/reminder.js`:

1. Заменить импорт:

```js
import { fetchConfigFromSide } from '../utils/watch-config'
```

на:

```js
import { syncFromPhone } from '../utils/sync-all'
```

2. В `handleEvent` для `mode === ALARM_MODES.SYNC` заменить:

```js
    fetchConfigFromSide('sync-тик')
    refreshAlarms()
    retrySync()
```

на:

```js
    syncFromPhone('sync-тик')
    retrySync()
```

3. Импорт из `../utils/schedule` изменить (там остаётся только
`createRetryTickAlarm`, используемый в `RETRY_TICK`):

```js
import { createRetryTickAlarm } from '../utils/schedule'
```

- [ ] **Шаг 4: прогнать и убедиться, что проходит**

Из `src/`:
`node --test test/reminder-service.test.js`

Ожидание: PASS, все тесты зелёные.

- [ ] **Шаг 5: коммит**

```bash
git add src/app-service/reminder.js src/test/reminder-service.test.js
git commit -m "refactor: sync-тик использует syncFromPhone (конфиг + take-логи за раз)"
```

---

### Задача 7: страница «Сегодня» (home) — подписка вместо сетевых запросов

**Файлы:**
- Изменить: `src/page/home/index.js`
- Тест: `src/test/home-page-render.test.js`

- [ ] **Шаг 1: добавить падающие тесты**

Дописать в конец `src/test/home-page-render.test.js`:

```js
test('build() не выполняет сетевых запросов к телефону', async () => {
  const sent = []
  globalThis.getApp = () => ({
    _options: {
      globalData: {
        messaging: {
          request(p) {
            sent.push(p)
            return Promise.resolve({ records: [] })
          },
        },
      },
    },
  })
  try {
    const page = instance()
    page.build()
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(sent.length, 0, 'build не должен ходить в сеть')
  } finally {
    delete globalThis.getApp
  }
})

test('событие данных перерисовывает страницу, после onDestroy — нет', async () => {
  const { emitDataChanged } = await import('../utils/data-events.js')
  const page = instance()
  page.build()
  const before = __getRedrawCount()
  emitDataChanged()
  assert.ok(__getRedrawCount() > before, 'событие данных вызывает перерисовку')
  page.onDestroy()
  const afterDestroy = __getRedrawCount()
  emitDataChanged()
  assert.equal(__getRedrawCount(), afterDestroy, 'после onDestroy событие не перерисовывает')
})
```

- [ ] **Шаг 2: прогнать и убедиться, что падает**

Из `src/`:
`node --test test/home-page-render.test.js`

Ожидание: FAIL (в `build()` сейчас вызываются `pullConfig` и `pullTakes`,
запросы уходят в мок; подписки нет).

- [ ] **Шаг 3: реализовать `home/index.js`**

В `src/page/home/index.js`:

1. Заменить импорт из sync (строка 5):

```js
import { sendTakeLogToPhone } from '../../utils/sync'
```

2. Удалить импорт watch-config (строка 7):

```js
import { fetchConfigFromSide } from '../../utils/watch-config'
```

3. Добавить импорт:

```js
import { subscribeToData } from '../../utils/data-events'
```

4. В `build()` (строки 20-26) заменить на:

```js
  build() {
    logger.log('home page build')
    this._destroyed = false
    this.refreshView()
    this._offData = subscribeToData(() => this.refreshView())
  },
```

5. Удалить методы `pullConfig` и `pullTakes` (строки 28-40).

6. В `onDestroy()` (строки 46-50) заменить на:

```js
  onDestroy() {
    logger.log('home page onDestroy')
    this._destroyed = true
    if (this._offData) this._offData()
    if (this.ui) this.ui.clear()
  },
```

- [ ] **Шаг 4: прогнать и убедиться, что проходит**

Из `src/`:
`node --test test/home-page-render.test.js`

Ожидание: PASS, все тесты зелёные.

- [ ] **Шаг 5: коммит**

```bash
git add src/page/home/index.js src/test/home-page-render.test.js
git commit -m "refactor: страница «Сегодня» не ходит в сеть при открытии, подписана на данные"
```

---

### Задача 8: страница «План дня» (plan) — подписка вместо сетевых запросов

**Файлы:**
- Изменить: `src/page/plan/index.js`
- Тест: `src/test/plan-page-render.test.js`

- [ ] **Шаг 1: добавить падающие тесты**

Дописать в конец `src/test/plan-page-render.test.js`:

```js
test('build() не выполняет сетевых запросов к телефону', async () => {
  const sent = []
  globalThis.getApp = () => ({
    _options: {
      globalData: {
        messaging: {
          request(p) {
            sent.push(p)
            return Promise.resolve({ records: [] })
          },
        },
      },
    },
  })
  try {
    const page = instance()
    page.build()
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(sent.length, 0, 'build не должен ходить в сеть')
  } finally {
    delete globalThis.getApp
  }
})

test('событие данных перерисовывает страницу, после onDestroy — нет', async () => {
  const { emitDataChanged } = await import('../utils/data-events.js')
  const page = instance()
  page.build()
  const before = __getRedrawCount()
  emitDataChanged()
  assert.ok(__getRedrawCount() > before, 'событие данных вызывает перерисовку')
  page.onDestroy()
  const afterDestroy = __getRedrawCount()
  emitDataChanged()
  assert.equal(__getRedrawCount(), afterDestroy, 'после onDestroy событие не перерисовывает')
})
```

- [ ] **Шаг 2: прогнать и убедиться, что падает**

Из `src/`:
`node --test test/plan-page-render.test.js`

Ожидание: FAIL (запросы уходят, подписки нет).

- [ ] **Шаг 3: реализовать `plan/index.js`**

В `src/page/plan/index.js`:

1. Заменить импорт из sync (строка 15):

```js
import { sendTakeLogToPhone, sendCancellationToPhone, sendUndoTakeToPhone } from '../../utils/sync'
```

2. Удалить импорт watch-config (строка 18):

```js
import { fetchConfigFromSide } from '../../utils/watch-config'
```

3. Добавить импорт:

```js
import { subscribeToData } from '../../utils/data-events'
```

4. В `build()` (строки 31-37) заменить на:

```js
  build() {
    logger.log('plan page build')
    this._destroyed = false
    this.refreshView()
    this._offData = subscribeToData(() => this.refreshView())
  },
```

5. Удалить методы `pullConfig` и `pullTakes` (строки 39-51).

6. В `onDestroy()` (строки 57-61) заменить на:

```js
  onDestroy() {
    logger.log('plan page onDestroy')
    this._destroyed = true
    if (this._offData) this._offData()
    if (this.ui) this.ui.clear()
  },
```

- [ ] **Шаг 4: прогнать и убедиться, что проходит**

Из `src/`:
`node --test test/plan-page-render.test.js`

Ожидание: PASS, все тесты зелёные.

- [ ] **Шаг 5: коммит**

```bash
git add src/page/plan/index.js src/test/plan-page-render.test.js
git commit -m "refactor: страница «План дня» не ходит в сеть при открытии, подписана на данные"
```

---

### Задача 9: полный прогон тестов

**Файлы:** нет (только проверка).

- [ ] **Шаг 1: прогнать все тесты**

Из `src/`:
`npm test`

Ожидание: все тесты PASS, без ошибок импорта.

- [ ] **Шаг 2: проверить, что не осталось ссылок на удалённые функции**

Из корня репозитория:
`git grep -n "syncConfig\|pullConfig\|pullTakes" -- src/`

Ожидание: пустой результат (кроме, при необходимости, упоминаний в тестах —
их быть не должно).

- [ ] **Шаг 3: обновить документацию по протоколу**

В `docs/phone-watch-communication.md`:

1. В разделе «Pull-запрос (request, `get_config`)» убрать пункт 2 (страницы
   home/plan в `build()`).
2. В разделе «`get_take_logs` (вытягивание истории)» заменить триггер
   «страницы home и plan в `build()`» на «старт приложения и фоновый sync-тик
   (`syncFromPhone`)».
3. В таблице раздела «Периодичность» строку
   «Открытие страницы home/plan | request `get_config` + request `get_take_logs`»
   удалить или заменить на «Старт приложения / sync-тик / push `config_synced`
   | request `get_config` + request `get_take_logs`».

- [ ] **Шаг 4: коммит**

```bash
git add docs/phone-watch-communication.md
git commit -m "docs: синхронизация выполняется при старте/тике/пуше, а не при навигации"
```
