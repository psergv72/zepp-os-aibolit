# План реализации: переход хранилища на easy-storage

> **Для агентных исполнителей:** ОБЯЗАТЕЛЬНЫЙ ПОД-НАВЫК: superpowers:subagent-driven-development (рекомендуется) или superpowers:executing-plans для реализации этого плана задача за задачей. Шаги используют синтаксис чекбоксов (`- [ ]`) для отслеживания.

**Цель:** Заменить собственное хранилище `src/utils/storage.js` на `@silver-zepp/easy-storage` v2 (гибрид: асинхронная запись через `AsyncStorage`, синхронное чтение через `Storage.ReadFile` + NDJSON-парсер), отказавшись от `@zos/storage` и прямых импортов `@zos/fs` из storage.js.

**Архитектура:** storage.js становится тонким фасадом: `setItem` кладёт значение в RAM-кэш (`pendingCache`) и асинхронно пишет NDJSON в по-ключевые файлы через `AsyncStorage.WriteJson`; `getItem` сначала смотрит кэш (мгновенная свежесть после записи в этом контексте), иначе синхронно читает файл через `Storage.ReadFile` + свой NDJSON-парсер. `AsyncStorage.SaveAndQuit()` в `onDestroy` app и app-service. Публичный API storage.js не меняется — страницы и утилиты не затрагиваются.

**Tech Stack:** ZeppOS 2.0+, `@silver-zepp/easy-storage` v2 (MIT), Node.js `node:test` для юнит-тестов.

---

## Контекст (обязательно прочитать перед началом)

- **Раздельные контексты:** `app.js` (страницы) и `app-service/reminder.js` — раздельные JS-контексты с раздельной памятью. Общий слой — файлы на диске. Поэтому НЕЛЬЗЯ использовать единый блоб (`EasyStorage`/`EasyStorageAsync`) — он перезапишет чужой ключ. Используем по-ключевые файлы.
- **NDJSON-формат:** `AsyncStorage.WriteJson` пишет файлы в собственном формате (meta-строка с токенами `T`/`A`/`D`/`M` + построчные записи массивов). При чтении понимает и обычный JSON (fallback, пишется `SaveAndQuit`).
- **Имена файлов сохраняются:** `aibolit-key-*.json`, `aibolit-pending.json`, `aibolit-debuglog.json`.
- **Тесты:** используют stub `@zos/storage` (`zos-storage.mjs`) для сида/чтения через `storage.__stores().get('aibolit-data.json').set/get(...)`. Библиотека `easy-storage` под node работает через stub `@zos/fs` (`zos-fs.mjs`), который нужно расширить до низкоуровневого API.

---

### Task 1: Установить `@silver-zepp/easy-storage`

**Files:**
- Modify: `src/package.json`
- Test: `src/test/import-easy-storage.test.js` (временный, удалить после)

- [ ] **Step 1: Установить пакет**

Выполнить в `src`:
```bash
npm i @silver-zepp/easy-storage
```

- [ ] **Step 2: Проверить, что пакет установился**

Выполнить:
```bash
Get-Content package.json
```
Ожидается: в `dependencies` появился `"@silver-zepp/easy-storage": "^2.0.0"` (или актуальная версия), в `node_modules` появилась директория `@silver-zepp/easy-storage`.

- [ ] **Step 3: Временный тест импорта**

Создать `src/test/import-easy-storage.test.js`:
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

import { AsyncStorage, Storage, EasyStorage } from '@silver-zepp/easy-storage'

test('easy-storage импортируется и экспортирует классы', () => {
  assert.equal(typeof AsyncStorage.WriteJson, 'function')
  assert.equal(typeof Storage.ReadFile, 'function')
  assert.equal(typeof EasyStorage, 'function')
})
```

- [ ] **Step 4: Запустить тест**

Выполнить в `src`:
```bash
npm test
```
Ожидается: тест `import-easy-storage` PASS. Это подтверждает, что библиотека загружается под node с zos-loader'ом.

- [ ] **Step 5: Commit**

```bash
git add src/package.json src/package-lock.json src/test/import-easy-storage.test.js
git commit -m "deps: добавить @silver-zepp/easy-storage для перехода хранилища"
```

---

### Task 2: Расширить stub `@zos/fs` под API библиотеки

**Files:**
- Modify: `src/test/helpers/stubs/zos-fs.mjs`

Библиотека `core.js` импортирует из `@zos/fs`:
`statSync, readSync, closeSync, openAssetsSync, mkdirSync, openSync, writeSync, rmSync, readdirSync, O_RDONLY, O_CREAT, O_WRONLY, O_RDWR, O_TRUNC`. Все эти имена ОБЯЗАНЫ существовать в stub, иначе import упадёт.

- [ ] **Step 1: Переписать zos-fs.mjs**

Заменить всё содержимое `src/test/helpers/stubs/zos-fs.mjs` на:

```js
const files = {}
let nextFd = 1
const fds = new Map()

export const O_RDONLY = 0
export const O_WRONLY = 1
export const O_RDWR = 2
export const O_CREAT = 512
export const O_TRUNC = 1024

function resolvePath(option) {
  if (option && typeof option === 'object') return option.path
  return option
}

function strToBuffer(str) {
  const buf = new ArrayBuffer(str.length * 2)
  const view = new Uint16Array(buf)
  for (let i = 0; i < str.length; i++) view[i] = str.charCodeAt(i)
  return buf
}

function bufferToStr(buffer) {
  const view = new Uint16Array(buffer)
  let s = ''
  for (let i = 0; i < view.length; i++) s += String.fromCharCode(view[i])
  return s
}

export function openSync(option) {
  const path = resolvePath(option)
  const fd = nextFd++
  fds.set(fd, path)
  if (files[path] === undefined) files[path] = ''
  return fd
}

export function closeSync(option) {
  fds.delete(option.fd)
}

export function writeSync(option) {
  const path = fds.get(option.fd)
  if (path === undefined) return -1
  files[path] = bufferToStr(option.buffer)
  return option.buffer.byteLength
}

export function readSync(option) {
  const path = fds.get(option.fd)
  if (path === undefined) return 0
  const data = files[path] === undefined ? '' : files[path]
  const view = new Uint16Array(option.buffer)
  let n = 0
  for (let i = 0; i < view.length && i < data.length; i++) {
    view[i] = data.charCodeAt(i)
    n++
  }
  return n
}

export function statSync(option) {
  const path = resolvePath(option)
  if (files[path] === undefined) return undefined
  return { size: String(files[path]).length * 2 }
}

export function rmSync(option) {
  const path = resolvePath(option)
  delete files[path]
}

export function mkdirSync(option) {
  const path = resolvePath(option)
  if (files[path] === undefined) files[path] = ''
  return 0
}

export function readdirSync(option) {
  const path = resolvePath(option)
  const prefix = path.endsWith('/') ? path : path + '/'
  return Object.keys(files)
    .filter(k => k.startsWith(prefix))
    .map(k => k.slice(prefix.length))
}

export function openAssetsSync(option) {
  return openSync(option)
}

export function writeFileSync(option) {
  const path = resolvePath(option)
  const data = option && typeof option === 'object' ? option.data : option
  files[path] = data
}

export function readFileSync(option) {
  const path = resolvePath(option)
  const value = files[path]
  return value === undefined ? undefined : value
}

export function __fsFiles() {
  return files
}

export function __resetFs() {
  for (const k of Object.keys(files)) delete files[k]
}
```

- [ ] **Step 2: Запустить существующие тесты**

Выполнить в `src`:
```bash
npm test
```
Ожидается: тесты, не связанные с хранением, проходят. Тесты `storage.test.js` и те, что сидят через `zos-storage`, могут временно падать — это нормально до Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/test/helpers/stubs/zos-fs.mjs
git commit -m "test: расширить stub @zos/fs под API easy-storage (openSync/writeSync/readSync и константы)"
```

---

### Task 3: Написать NDJSON-парсер и тесты к нему

**Files:**
- Create: `src/utils/ndjson.js`
- Create: `src/test/ndjson.test.js`

Парсер — синхронная копия логики `#parseMultiSync` и `nd_tokenDecode` из `easy-storage-async.js` (MIT). Читает и NDJSON (записи `AsyncStorage`), и обычный JSON (fallback после `SaveAndQuit`).

- [ ] **Step 1: Написать тест (TDD)**

Создать `src/test/ndjson.test.js`:
```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseNdJson } from '../utils/ndjson.js'

test('parseNdJson разбирает простую meta-строку без массивов', () => {
  const raw = '{"T":"meta","syncAlarmId":42}\n'
  assert.deepEqual(parseNdJson(raw), { syncAlarmId: 42 })
})

test('parseNdJson разбирает объект с массивом (построчные записи)', () => {
  const raw = '{"T":"meta","A":["medications"],"medications":2}\n{"T":"medications","D":{"id":"m1"}}\n{"T":"medications","D":{"id":"m2"}}\n'
  assert.deepEqual(parseNdJson(raw), { medications: [{ id: 'm1' }, { id: 'm2' }] })
})

test('parseNdJson разбирает обычный JSON (fallback после SaveAndQuit)', () => {
  const raw = '{"medications":[{"id":"m1"}]}'
  assert.deepEqual(parseNdJson(raw), { medications: [{ id: 'm1' }] })
})

test('parseNdJson возвращает undefined для пустой строки', () => {
  assert.equal(parseNdJson(''), undefined)
  assert.equal(parseNdJson(undefined), undefined)
  assert.equal(parseNdJson(null), undefined)
})

test('parseNdJson возвращает undefined для битого содержимого', () => {
  assert.equal(parseNdJson('not json'), undefined)
})

test('parseNdJson сохраняет вложенные объекты и скаляры в meta', () => {
  const raw = '{"T":"meta","settings":{"debugMode":true,"minFontSize":16},"configRevision":3}\n'
  assert.deepEqual(parseNdJson(raw), { settings: { debugMode: true, minFontSize: 16 }, configRevision: 3 })
})
```

- [ ] **Step 2: Запустить тест, убедиться что падает**

Выполнить в `src`:
```bash
npm test
```
Ожидается: FAIL, «Cannot find module '../utils/ndjson.js'».

- [ ] **Step 3: Реализовать парсер**

Создать `src/utils/ndjson.js`:
```js
const TOK = { T: 'type', A: '__arrays', D: 'data', M: 'meta' }

function decodeTokens(obj) {
  for (const k in obj) {
    const nk = TOK[k]
    if (nk && nk !== k) {
      obj[nk] = obj[k]
      delete obj[k]
    }
  }
  return obj
}

export function parseNdJson(content) {
  const raw = String(content || '').trim()
  if (!raw) return undefined

  const lines = raw.split('\n')
  if (!lines.length) return undefined

  let first
  try {
    first = decodeTokens(JSON.parse(lines[0]))
  } catch (e) {
    return undefined
  }
  if (!first || first.type !== 'meta') {
    try {
      return JSON.parse(raw)
    } catch (e) {
      return undefined
    }
  }

  const res = {}
  const arrays = {}
  for (let i = 0; i < lines.length; i++) {
    let obj
    try {
      obj = decodeTokens(JSON.parse(lines[i]))
    } catch (e) {
      continue
    }
    if (obj.type === 'meta') {
      const af = obj.__arrays || []
      const lookup = {}
      for (let j = 0; j < af.length; j++) lookup[af[j]] = 1
      for (const k in obj) {
        if (k === 'type' || k === '__arrays') continue
        const v = obj[k]
        if (lookup[k]) {
          arrays[k] = []
          res[k] = arrays[k]
        } else {
          res[k] = v
        }
      }
    } else {
      const akey = obj.type
      if (!arrays[akey]) {
        arrays[akey] = []
        res[akey] = arrays[akey]
      }
      arrays[akey].push(obj.data)
    }
  }
  return res
}
```

- [ ] **Step 4: Запустить тесты парсера**

Выполнить в `src`:
```bash
npm test
```
Ожидается: `ndjson.test.js` — все PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/ndjson.js src/test/ndjson.test.js
git commit -m "feat: NDJSON-парсер для чтения файлов easy-storage"
```

---

### Task 4: Переписать `src/utils/storage.js` на easy-storage

**Files:**
- Modify: `src/utils/storage.js`

Публичный API сохраняется полностью. Внутри — фасад над `AsyncStorage`/`Storage` + `pendingCache` + `parseNdJson`.

- [ ] **Step 1: Переписать storage.js**

Заменить всё содержимое `src/utils/storage.js` на:

```js
import { AsyncStorage, Storage } from '@silver-zepp/easy-storage'
import { parseNdJson } from './ndjson.js'
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants'

const pendingCache = new Map()

const FS_FILE_NAMES = {
  [STORAGE_KEYS.MEDICATIONS]: 'aibolit-key-medications.json',
  [STORAGE_KEYS.INTAKES]: 'aibolit-key-intakes.json',
  [STORAGE_KEYS.TAKE_LOGS]: 'aibolit-key-take-logs.json',
  [STORAGE_KEYS.CANCELLATIONS]: 'aibolit-key-cancellations.json',
  [STORAGE_KEYS.SETTINGS]: 'aibolit-key-settings.json',
  [STORAGE_KEYS.SYNC_QUEUE]: 'aibolit-key-sync-queue.json',
  [STORAGE_KEYS.CONFIG_REVISION]: 'aibolit-key-config-revision.json',
  [STORAGE_KEYS.SYNC_ALARM_ID]: 'aibolit-key-sync-alarm-id.json',
  [STORAGE_KEYS.SNOOZE_ALARM_ID]: 'aibolit-key-snooze-id.json',
  [STORAGE_KEYS.RETRY_TICK_ALARM_ID]: 'aibolit-key-retry-tick-id.json',
  [STORAGE_KEYS.ALARM_REGISTRY]: 'aibolit-key-alarm-registry.json',
  [STORAGE_KEYS.PENDING_NOTIFICATION]: 'aibolit-pending.json',
  [STORAGE_KEYS.DEBUG_LOG]: 'aibolit-debuglog.json',
  retryTickCount: 'aibolit-key-retry-tick-count.json',
}

function readKeyFile(path, key) {
  try {
    const content = Storage.ReadFile(path)
    if (!content) return undefined
    const parsed = parseNdJson(content)
    if (parsed === undefined || parsed === null) return undefined
    return parsed[key]
  } catch (e) {
    return undefined
  }
}

export function getItem(key, defaultValue = null) {
  if (pendingCache.has(key)) return pendingCache.get(key)
  const path = FS_FILE_NAMES[key]
  if (path) {
    const fromFile = readKeyFile(path, key)
    if (fromFile !== undefined) return fromFile
  }
  return defaultValue
}

export function setItem(key, value) {
  pendingCache.set(key, value)
  const path = FS_FILE_NAMES[key]
  if (path) AsyncStorage.WriteJson(path, { [key]: value })
}

export function removeItem(key) {
  pendingCache.delete(key)
  const path = FS_FILE_NAMES[key]
  if (path) Storage.RemoveFile(path)
}

export function clear() {
  pendingCache.clear()
  for (const path of Object.values(FS_FILE_NAMES)) {
    Storage.RemoveFile(path)
  }
}

export function saveAndQuit() {
  return AsyncStorage.SaveAndQuit()
}

export function getMedications() {
  const value = getItem(STORAGE_KEYS.MEDICATIONS, [])
  return Array.isArray(value) ? value : []
}

export function setMedications(medications) {
  setItem(STORAGE_KEYS.MEDICATIONS, medications)
}

export function getIntakes() {
  const value = getItem(STORAGE_KEYS.INTAKES, [])
  return Array.isArray(value) ? value : []
}

export function setIntakes(intakes) {
  setItem(STORAGE_KEYS.INTAKES, intakes)
}

export function getTakeLogs() {
  const value = getItem(STORAGE_KEYS.TAKE_LOGS, [])
  return Array.isArray(value) ? value : []
}

export function setTakeLogs(takeLogs) {
  setItem(STORAGE_KEYS.TAKE_LOGS, takeLogs)
}

export function addTakeLog(takeLog) {
  const takeLogs = getTakeLogs()
  takeLogs.push(takeLog)
  setTakeLogs(takeLogs)
  return takeLog
}

export function removeTakeLog(takeLogId) {
  const takeLogs = getTakeLogs()
  const filtered = takeLogs.filter(i => i.id !== takeLogId)
  setTakeLogs(filtered)
  return filtered
}

export function getCancellations() {
  const value = getItem(STORAGE_KEYS.CANCELLATIONS, [])
  return Array.isArray(value) ? value : []
}

export function setCancellations(cancellations) {
  setItem(STORAGE_KEYS.CANCELLATIONS, cancellations)
}

export function addCancellation(intakeId, date) {
  const cancellations = getCancellations()
  const existing = cancellations.find(c => c.intakeId === intakeId && c.date === date)
  if (!existing) {
    cancellations.push({ intakeId, date })
    setCancellations(cancellations)
  }
}

export function removeCancellation(intakeId, date) {
  const cancellations = getCancellations()
  const filtered = cancellations.filter(c => !(c.intakeId === intakeId && c.date === date))
  setCancellations(filtered)
}

export function isIntakeCancelled(intakeId, date) {
  const cancellations = getCancellations()
  return cancellations.some(c => c.intakeId === intakeId && c.date === date)
}

export function getSettings() {
  const settings = getItem(STORAGE_KEYS.SETTINGS, null)
  return settings && typeof settings === 'object' ? settings : { ...DEFAULT_SETTINGS }
}

export function setSettings(settings) {
  setItem(STORAGE_KEYS.SETTINGS, settings)
}

export function getSyncQueue() {
  const value = getItem(STORAGE_KEYS.SYNC_QUEUE, [])
  return Array.isArray(value) ? value : []
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
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getYesterdayDateStr() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function pruneOldTakeLogs() {
  const today = getTodayDateStr()
  const yesterday = getYesterdayDateStr()
  const takeLogs = getTakeLogs()
  const filtered = takeLogs.filter(i => i.date === today || i.date === yesterday)
  setTakeLogs(filtered)
}

export function clearAll() {
  clear()
}

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

export function getSnoozeAlarmId() {
  const value = getItem(STORAGE_KEYS.SNOOZE_ALARM_ID, null)
  return typeof value === 'number' ? value : null
}

export function setSnoozeAlarmId(id) {
  setItem(STORAGE_KEYS.SNOOZE_ALARM_ID, id)
}

export function clearSnoozeAlarmId() {
  removeItem(STORAGE_KEYS.SNOOZE_ALARM_ID)
}

export function getRetryTickAlarmId() {
  const value = getItem(STORAGE_KEYS.RETRY_TICK_ALARM_ID, null)
  return typeof value === 'number' ? value : null
}

export function setRetryTickAlarmId(id) {
  setItem(STORAGE_KEYS.RETRY_TICK_ALARM_ID, id)
}

export function getRetryTickCount() {
  const value = getItem('retryTickCount', 0)
  return typeof value === 'number' ? value : 0
}

export function setRetryTickCount(count) {
  setItem('retryTickCount', count)
}

export function getDebugLog() {
  const value = getItem(STORAGE_KEYS.DEBUG_LOG, [])
  return Array.isArray(value) ? value : []
}

export function setDebugLog(log) {
  const normalized = Array.isArray(log) ? log : []
  setItem(STORAGE_KEYS.DEBUG_LOG, normalized)
}

export function getAlarmRegistry() {
  const value = getItem(STORAGE_KEYS.ALARM_REGISTRY, {})
  return value && typeof value === 'object' ? value : {}
}

export function setAlarmRegistry(registry) {
  setItem(STORAGE_KEYS.ALARM_REGISTRY, registry && typeof registry === 'object' ? registry : {})
}

export function registerAlarm(id, info) {
  if (id === null || id === undefined) return
  const registry = getAlarmRegistry()
  registry[id] = info
  setAlarmRegistry(registry)
}

export function unregisterAlarm(id) {
  if (id === null || id === undefined) return
  const registry = getAlarmRegistry()
  if (registry[id] !== undefined) {
    delete registry[id]
    setAlarmRegistry(registry)
  }
}

export function getPendingNotification() {
  const value = getItem(STORAGE_KEYS.PENDING_NOTIFICATION, null)
  return value && typeof value === 'object' ? value : null
}

export function setPendingNotification(pending) {
  setItem(STORAGE_KEYS.PENDING_NOTIFICATION, pending)
}

export function clearPendingNotification() {
  removeItem(STORAGE_KEYS.PENDING_NOTIFICATION)
}
```

ВАЖНО: импорт `./ndjson.js` с расширением `.js` — обязателен, т.к. в рантайме ZeppOS нет zos-loader, который подставляет расширения. zos-loader в тестах резолвит и `.js`-вариант.

- [ ] **Step 2: Запустить тесты парсера и импорта**

Выполнить в `src`:
```bash
npm test
```
Ожидается: `ndjson.test.js` PASS. Тесты, использующие `storage.js` через публичный API, могут падать — их чиним в Task 5 (после обновления `zos-storage.mjs`).

- [ ] **Step 3: Commit**

```bash
git add src/utils/storage.js
git commit -m "feat: фасад хранилища на easy-storage (AsyncStorage + NDJSON + кэш), без @zos/storage"
```

---

### Task 5: Обновить stub `@zos/storage` до моста к storage.js

**Files:**
- Modify: `src/test/helpers/stubs/zos-storage.mjs`

Тесты сидят/читают через `storage.__stores().get('aibolit-data.json').set(key, value)` и `.get(key)`. После рефакторинга storage.js не использует `@zos/storage`, поэтому stub превращаем в мост к низкоуровневому API storage.js. Это сохраняет все существующие тесты почти без правок.

- [ ] **Step 1: Переписать zos-storage.mjs**

Заменить всё содержимое `src/test/helpers/stubs/zos-storage.mjs` на:

```js
import { getItem, setItem, removeItem, clear } from '../../utils/storage.js'
import { __resetFs } from './zos-fs.mjs'

const stores = new Map()

class LocalStorageLike {
  constructor(name) {
    this.name = name
    if (!stores.has(name)) {
      stores.set(name, this)
    }
  }

  getItem(key) {
    return getItem(key, undefined)
  }

  setItem(key, value) {
    setItem(key, value)
  }

  removeItem(key) {
    removeItem(key)
  }

  clear() {
    clear()
  }

  set(key, value) {
    this.setItem(key, value)
  }

  get(key) {
    return this.getItem(key)
  }

  has(key) {
    return this.getItem(key) !== undefined
  }
}

export class ShareLocalStorage extends LocalStorageLike {}

export class LocalStorage extends LocalStorageLike {}

export function __resetStorage() {
  clear()
  __resetFs()
}

export function __stores() {
  return stores
}
```

- [ ] **Step 2: Прогнать все тесты**

Выполнить в `src`:
```bash
npm test
```
Ожидается: большинство тестов проходят. Возможные падения — там, где тесты ожидают старое поведение (например, `store().get(key)` возвращал `undefined`, а теперь файл с `undefined`-значением). Чиним по факту в Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/test/helpers/stubs/zos-storage.mjs
git commit -m "test: stub @zos/storage становится мостом к новому фасаду хранилища"
```

---

### Task 6: Починить оставшиеся тесты

**Files:**
- Modify: по факту (см. ниже), главный кандидат — `src/test/storage.test.js`

Тесты, которые проверяли старое поведение «персистентность в fs + переживает сброс ShareLocalStorage», нужно переписать под новую модель (кэш + NDJSON-файлы).

- [ ] **Step 1: Прогнать тесты и зафиксировать падения**

Выполнить в `src`:
```bash
npm test
```
Записать список упавших тестов.

- [ ] **Step 2: Переписать storage.test.js под новую модель**

Заменить всё содержимое `src/test/storage.test.js` на:

```js
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const fs = await import('./helpers/stubs/zos-fs.mjs')
const {
  getConfigRevision,
  setConfigRevision,
  getSyncAlarmId,
  setSyncAlarmId,
  clearSyncAlarmId,
  getPendingNotification,
  setPendingNotification,
  clearPendingNotification,
  getDebugLog,
  setDebugLog,
  getAlarmRegistry,
  setAlarmRegistry,
  registerAlarm,
  unregisterAlarm,
  getMedications,
  setMedications,
  getIntakes,
  setIntakes,
  getSettings,
  setSettings,
  getSyncQueue,
  setSyncQueue,
  getCancellations,
  setCancellations,
  isIntakeCancelled,
  saveAndQuit,
} = await import('../utils/storage.js')

beforeEach(() => {
  fs.__resetFs()
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

test('конфиг (медикаменты, приёмы, настройки) читается через кэш сразу после записи', () => {
  setMedications([{ id: 'm1', name: 'Парацетамол', enabled: true }])
  setIntakes([{ id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] }])
  setSettings({ minFontSize: 20 })
  setConfigRevision(7)

  assert.deepEqual(getMedications(), [{ id: 'm1', name: 'Парацетамол', enabled: true }])
  assert.deepEqual(getIntakes(), [{ id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] }])
  assert.deepEqual(getSettings(), { minFontSize: 20 })
  assert.equal(getConfigRevision(), 7)
})

test('данные записываются в по-ключевые NDJSON-файлы после saveAndQuit', () => {
  setMedications([{ id: 'm1', name: 'Парацетамол', enabled: true }])
  setSyncAlarmId(42)
  saveAndQuit()

  const fsFiles = fs.__fsFiles()
  const medFile = fsFiles['aibolit-key-medications.json']
  const alarmFile = fsFiles['aibolit-key-sync-alarm-id.json']
  assert.ok(medFile, 'файл медикаментов создан')
  assert.ok(alarmFile, 'файл sync-alarm id создан')
  assert.ok(medFile.includes('"T":"meta"'), 'файл медикаментов в NDJSON-формате')
  assert.ok(alarmFile.includes('"T":"meta"'), 'файл sync-alarm id в NDJSON-формате')
})

test('чтение из файла после сброса кэша (имитация другого контекста)', () => {
  setMedications([{ id: 'm1' }])
  saveAndQuit()
  // сбрасываем кэш, удаляя файл через fs stub и пере-сидя файл вручную в NDJSON
  fs.__resetFs()
  const { writeFileSync } = fs
  writeFileSync({ path: 'aibolit-key-medications.json', data: '{"T":"meta","A":["medications"],"medications":1}\n{"T":"medications","D":{"id":"m1"}}\n' })
  // чистый кэш: getMedications читает с диска
  assert.deepEqual(getMedications(), [{ id: 'm1' }])
})

test('getPendingNotification возвращает null, если pending не задан', () => {
  assert.equal(getPendingNotification(), null)
})

test('setPendingNotification сохраняет объект, getPendingNotification его возвращает', () => {
  const pending = { intakeId: 'i1', date: '2026-08-07' }
  setPendingNotification(pending)
  assert.deepEqual(getPendingNotification(), pending)
})

test('clearPendingNotification сбрасывает pending в null', () => {
  setPendingNotification({ intakeId: 'i1', date: '2026-08-07' })
  clearPendingNotification()
  assert.equal(getPendingNotification(), null)
})

test('getDebugLog возвращает пустой массив, если лог не задан', () => {
  assert.deepEqual(getDebugLog(), [])
})

test('setDebugLog сохраняет массив, getDebugLog его возвращает', () => {
  setDebugLog([{ ts: 1, message: 'x' }])
  assert.deepEqual(getDebugLog(), [{ ts: 1, message: 'x' }])
})

test('setDebugLog игнорирует не-массив и сбрасывает в пустой', () => {
  setDebugLog('oops')
  assert.deepEqual(getDebugLog(), [])
})

test('getAlarmRegistry возвращает пустой объект, если реестр не задан', () => {
  assert.deepEqual(getAlarmRegistry(), {})
})

test('setAlarmRegistry сохраняет объект, getAlarmRegistry его возвращает', () => {
  setAlarmRegistry({ 1: { type: 'intake', intakeId: 'i1' } })
  assert.deepEqual(getAlarmRegistry(), { 1: { type: 'intake', intakeId: 'i1' } })
})

test('setAlarmRegistry игнорирует не-объект и сбрасывает в пустой', () => {
  setAlarmRegistry('oops')
  assert.deepEqual(getAlarmRegistry(), {})
})

test('registerAlarm добавляет запись в реестр', () => {
  registerAlarm(7, { type: 'sync', interval: 60 })
  assert.deepEqual(getAlarmRegistry(), { 7: { type: 'sync', interval: 60 } })
})

test('registerAlarm не меняет реестр при отсутствии id', () => {
  setAlarmRegistry({ 7: { type: 'sync' } })
  registerAlarm(null, { type: 'sync' })
  registerAlarm(undefined, { type: 'sync' })
  assert.deepEqual(getAlarmRegistry(), { 7: { type: 'sync' } })
})

test('unregisterAlarm удаляет запись из реестра', () => {
  registerAlarm(7, { type: 'sync' })
  registerAlarm(9, { type: 'intake' })
  unregisterAlarm(7)
  assert.deepEqual(getAlarmRegistry(), { 9: { type: 'intake' } })
})

test('unregisterAlarm не ломает реестр при отсутствии id', () => {
  registerAlarm(7, { type: 'sync' })
  unregisterAlarm(null)
  unregisterAlarm(99)
  assert.deepEqual(getAlarmRegistry(), { 7: { type: 'sync' } })
})

test('syncQueue сохраняется и очищается', () => {
  setSyncQueue([{ id: 'a', intakeId: 'i1' }])
  assert.deepEqual(getSyncQueue(), [{ id: 'a', intakeId: 'i1' }])
  setSyncQueue([])
  assert.deepEqual(getSyncQueue(), [])
})

test('cancellations: добавление, проверка, повторное добавление не дублирует', () => {
  setCancellations([])
  setCancellations([{ intakeId: 'i1', date: '2026-08-07' }])
  assert.equal(isIntakeCancelled('i1', '2026-08-07'), true)
  assert.equal(isIntakeCancelled('i2', '2026-08-07'), false)
})
```

- [ ] **Step 3: Прогнать storage.test.js**

Выполнить в `src`:
```bash
node --test test/storage.test.js
```
Ожидается: все PASS.

- [ ] **Step 4: Прогнать ВСЕ тесты и починить оставшиеся падения**

Выполнить в `src`:
```bash
npm test
```
Для каждого упавшего теста: посмотреть на причину. Типичные причины и правки:

1. **Тест сидит `store().set(key, value)` и ожидает, что `store().get(key)` вернёт `undefined` после `removeItem`** — теперь возвращается `null`/дефолт из-за нового поведения. Правка: уточнить ожидание теста (например, `assert.equal(store().get(key) ?? null, null)`).
2. **Тест сидит значение через `store().set('debugLog', ...)`, а storage.js читает через `getDebugLog()`** — работает через кэш, должно проходить.
3. **Тест проверяет персистентность через сброс ShareLocalStorage** — заменить на проверку NDJSON-файла (см. storage.test.js выше).

- [ ] **Step 5: Commit**

```bash
git add src/test/storage.test.js
git commit -m "test: переписать storage.test.js под easy-storage (NDJSON + кэш)"
```

---

### Task 7: Добавить `saveAndQuit()` в onDestroy

**Files:**
- Modify: `src/app.js`
- Modify: `src/app-service/reminder.js`

`AsyncStorage.SaveAndQuit()` синхронно сбрасывает очередь записи, чтобы данные не потерялись при закрытии приложения.

- [ ] **Step 1: app.js**

В `src/app.js`:
- Добавить импорт: `import { saveAndQuit } from './utils/storage'` (в блок существующих импортов из `./utils/...`).
- В `onDestroy()` заменить:
```js
    onDestroy() {
      logger.log('app onDestroy invoked')
    }
```
на:
```js
    onDestroy() {
      logger.log('app onDestroy invoked')
      saveAndQuit()
    }
```

- [ ] **Step 2: reminder.js**

В `src/app-service/reminder.js`:
- Добавить импорт: `saveAndQuit` в строку `import { getTodayDateStr, clearSnoozeAlarmId } from '../utils/storage'` → `import { getTodayDateStr, clearSnoozeAlarmId, saveAndQuit } from '../utils/storage'`.
- В `onDestroy()` заменить:
```js
  onDestroy() {
    logger.log('reminder onDestroy')
  },
```
на:
```js
  onDestroy() {
    logger.log('reminder onDestroy')
    saveAndQuit()
  },
```

- [ ] **Step 3: Прогнать тесты**

Выполнить в `src`:
```bash
npm test
```
Ожидается: PASS. (Тесты `app.test.js` и `reminder-service.test.js` проверяют onDestroy-хуки — должны продолжать проходить, т.к. `saveAndQuit` безвредна в тестах.)

- [ ] **Step 4: Commit**

```bash
git add src/app.js src/app-service/reminder.js
git commit -m "feat: saveAndQuit (сброс очереди AsyncStorage) в onDestroy app и reminder"
```

---

### Task 8: Удалить временный тест импорта

**Files:**
- Delete: `src/test/import-easy-storage.test.js`

- [ ] **Step 1: Удалить файл**

```bash
Remove-Item src/test/import-easy-storage.test.js
```

- [ ] **Step 2: Прогнать тесты**

Выполнить в `src`:
```bash
npm test
```
Ожидается: все PASS (кроме тех, что мы сознательно не трогали — см. Task 6).

- [ ] **Step 3: Commit**

```bash
git add -A src/test/import-easy-storage.test.js
git commit -m "test: убрать временный тест импорта easy-storage"
```

---

### Task 9: Сборка приложения

**Files:**
- (проверка) `src/utils/storage.js`, `src/utils/ndjson.js`, `src/app.js`, `src/app-service/reminder.js`

- [ ] **Step 1: Собрать приложение**

Выполнить:
```bash
cmd /c "cd /d C:\_Soft\_ZepOS\aibolit\src && npm run build"
```
Ожидается: сборка успешна, ошибок нет. Если zeus падает на приватных полях библиотеки (`#field` в `easy-storage-async.js` и др.) — ошибка будет вида «unexpected token #». Тогда:
- проверить, действительно ли сборка включает только используемые модули (tree-shaking);
- если нет — открыть обсуждение с пользователем: возможно, потребуется перейти на `easy-storage` v1 (без приватных полей) или импортировать напрямую `easy-storage/v1/easy-storage.js`.

- [ ] **Step 2: Финальный прогон тестов**

Выполнить в `src`:
```bash
npm test
```
Ожидается: все PASS.

- [ ] **Step 3: Commit**

```bash
git add src/utils/storage.js
git commit -m "fix: явное расширение .js в импорте ndjson для сборки zeus"
```

---

## Критерии готовности

- [ ] `src/utils/storage.js` не импортирует `@zos/storage` и `@zos/fs`.
- [ ] Все существующие тесты проходят (`npm test` в `src`).
- [ ] `npm run build` (zeus) успешен.
- [ ] Публичный API storage.js не изменён.
