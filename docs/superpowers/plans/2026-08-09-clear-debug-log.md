# План реализации: кнопка «Очистить» на странице «Отладка»

> **Для агентных исполнителей:** ОБЯЗАТЕЛЬНЫЙ СУБ-НАВЫК: используйте superpowers:subagent-driven-development (рекомендуется) или superpowers:executing-plans для выполнения этого плана по задачам. Шаги используют чекбоксы (`- [ ]`) для отслеживания прогресса.

**Цель:** Добавить кнопку «Очистить» на страницу «Отладка» приложения телефона, которая очищает лог отладочных сообщений на часах и снимок `debugInfo` на телефоне.

**Архитектура:** Полный цикл по образцу механизма «Обновить»: кнопка пишет ключ `debugClear` в phone settings → side service замечает изменение в `onSettingsChange` и вызывает часы через `this.call({ method: 'clear_debug' })` → часы в `App.onCall` вызывают существующий `clearDebugLog()`. Сам телефон при этом сразу удаляет локальный снимок `debugInfo`.

**Tech Stack:** Zepp OS (ZeppOS), phone app (AppSettingsPage), side service (BaseSideService), Node.js `node:test` для тестов.

**Тесты:** `cd src; node --test "test/*.test.js"` (все 266 тестов зелёные до изменений). Один файл: `node --test test/<имя>.test.js`.

---

### Задача 1: Константа `CLEAR_DEBUG`

**Файлы:**
- Modify: `src/utils/constants.js:53-63` (объект `ZML_METHODS`)
- Test: `src/test/constants.test.js`

- [ ] **Шаг 1: Написать падающий тест**

В `src/test/constants.test.js` заменить строку импорта:

```js
import { DEFAULT_SETTINGS, ZML_METHODS } from '../utils/constants.js'
```

и добавить в конец файла тест:

```js
test('ZML_METHODS.CLEAR_DEBUG равен clear_debug', () => {
  assert.equal(ZML_METHODS.CLEAR_DEBUG, 'clear_debug')
})
```

- [ ] **Шаг 2: Убедиться, что тест падает**

Run: `node --test test/constants.test.js`
Expected: FAIL — `ZML_METHODS.CLEAR_DEBUG` равен `undefined`

- [ ] **Шаг 3: Реализовать константу**

В `src/utils/constants.js` добавить последней строкой в `ZML_METHODS`:

```js
  REQUEST_DEBUG: 'request_debug',
  CLEAR_DEBUG: 'clear_debug',
```

- [ ] **Шаг 4: Убедиться, что тест проходит**

Run: `node --test test/constants.test.js`
Expected: PASS (2 теста)

- [ ] **Шаг 5: Коммит**

```bash
git add src/utils/constants.js src/test/constants.test.js
git commit -m "feat: метод clear_debug для очистки отладочного лога"
```

---

### Задача 2: Side service — обработка ключа `debugClear`

**Файлы:**
- Modify: `src/app-side/index.js:21-31` (`onSettingsChange`)
- Test: `src/test/app-side.test.js`

- [ ] **Шаг 1: Написать падающие тесты**

Добавить в конец `src/test/app-side.test.js` (после теста `onSettingsChange для debugRefresh не трогает ревизию конфига`, строка 185):

```js
test('onSettingsChange для debugClear просит часы очистить отладочный лог', () => {
  const calls = []
  sideOpts.call = (payload) => { calls.push(payload) }

  sideOpts.onSettingsChange({ key: 'debugClear' })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'clear_debug')
})

test('onSettingsChange для debugClear не трогает ревизию конфига', () => {
  const calls = []
  sideOpts.call = (payload) => { calls.push(payload) }

  sideOpts.onSettingsChange({ key: 'debugClear' })

  assert.equal(JSON.parse(storageMap.get('configRevision')), 2)
})
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

Run: `node --test test/app-side.test.js`
Expected: FAIL — `calls.length` равен 0 (метод не отправляется)

- [ ] **Шаг 3: Реализовать обработку ключа**

В `src/app-side/index.js` в `onSettingsChange` вставить блок после обработки `debugRefresh`:

```js
      if (key === 'debugClear') {
        try {
          this.call({ method: ZML_METHODS.CLEAR_DEBUG })
        } catch (error) {
          console.log(`Debug clear request failed: ${error}`)
        }
        return
      }
```

- [ ] **Шаг 4: Убедиться, что тесты проходят**

Run: `node --test test/app-side.test.js`
Expected: PASS (все тесты файла)

- [ ] **Шаг 5: Коммит**

```bash
git add src/app-side/index.js src/test/app-side.test.js
git commit -m "feat: side service обрабатывает debugClear и шлёт часы clear_debug"
```

---

### Задача 3: Часы — очистка лога по `clear_debug`

**Файлы:**
- Modify: `src/app.js:8` (импорт), `src/app.js:27-36` (`onCall`)
- Test: `src/test/app.test.js`

- [ ] **Шаг 1: Написать падающий тест**

Добавить в конец `src/test/app.test.js`:

```js
test('onCall CLEAR_DEBUG очищает отладочный лог на часах', () => {
  const store = storage.__stores().get('aibolit-data.json')
  store.set('settings', { debugMode: true })
  store.set('debugLog', [{ ts: 1, message: 'старое' }])

  appOpts.onCall({ method: 'clear_debug' })

  assert.deepEqual(store.get('debugLog'), [])
})
```

- [ ] **Шаг 2: Убедиться, что тест падает**

Run: `node --test test/app.test.js`
Expected: FAIL — `debugLog` остаётся `[{ ts: 1, message: 'старое' }]`

- [ ] **Шаг 3: Реализовать обработку метода**

В `src/app.js`:

```js
import { pushDebugSnapshot, addDebugEntry, clearDebugLog } from './utils/debug-log'
```

и в `onCall` после блока `REQUEST_DEBUG`:

```js
      if (data && data.method === ZML_METHODS.CLEAR_DEBUG) {
        clearDebugLog()
      }
```

- [ ] **Шаг 4: Убедиться, что тест проходит**

Run: `node --test test/app.test.js`
Expected: PASS (все тесты файла)

- [ ] **Шаг 5: Коммит**

```bash
git add src/app.js src/test/app.test.js
git commit -m "feat: часы очищают debugLog по методу clear_debug"
```

---

### Задача 4: Телефон — метод `clearDebug()` и кнопка «Очистить»

**Файлы:**
- Modify: `src/setting/index.js:1-7` (телефонные `STORAGE_KEYS`), `src/setting/index.js:640` (после `requestDebugRefresh`), `src/setting/index.js:736-743` (`renderDebugPage`)
- Test: `src/test/settings-render.test.js`

- [ ] **Шаг 1: Написать падающие тесты**

Добавить в `src/test/settings-render.test.js` после теста «кнопка „Обновить"...» (строка 426):

```js
test('кнопка «Очистить» присутствует на странице Отладка', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('debug')
  const tree = options.build({ settingsStorage: storage })
  const btn = findByButton(tree, 'Очистить')
  assert.ok(btn, 'должна быть кнопка Очистить')
})

test('клик по «Очистить» очищает снимок, пишет debugClear и не ждёт ответа часов', () => {
  const storage = createStorage()
  setup(storage)
  storage.setItem('debugInfo', JSON.stringify({ ts: 1, timers: [], log: [{ ts: 2, message: 'x' }] }))
  options.navigateTo('debug')
  assert.equal(options.state.debugWaiting, true, 'после входа в отладку идёт запрос')
  const tree = options.build({ settingsStorage: storage })
  const btn = findByButton(tree, 'Очистить')
  assert.ok(btn)

  btn.props.onClick()

  assert.equal(storage.getItem('debugInfo'), null, 'снимок очищен на телефоне')
  assert.ok(storage.getItem('debugClear'), 'записан debugClear для side service')
  assert.equal(options.state.debugWaiting, false, 'очистка не запускает ожидание ответа часов')
})
```

- [ ] **Шаг 2: Убедиться, что тесты падают**

Run: `node --test test/settings-render.test.js`
Expected: FAIL — `findByButton(tree, 'Очистить')` возвращает `null`

- [ ] **Шаг 3: Реализовать метод и кнопку**

В `src/setting/index.js`:

1. Добавить ключ в телефонные `STORAGE_KEYS`:

```js
const STORAGE_KEYS = {
  medications: 'medications',
  intakes: 'intakes',
  settings: 'settings',
  debugInfo: 'debugInfo',
  debugRefresh: 'debugRefresh',
  debugClear: 'debugClear',
}
```

2. Добавить метод `clearDebug()` сразу после `requestDebugRefresh()` (после строки 639):

```js
  clearDebug() {
    this.storage().removeItem(STORAGE_KEYS.debugInfo)
    this.state.debugWaiting = false
    this.state.debugTimedOut = false
    const prev = this.storage().getItem(STORAGE_KEYS.debugClear)
    const next = (prev ? Number(prev) : Date.now()) + 1
    this.storage().setItem(STORAGE_KEYS.debugClear, String(next))
    this.forceRender()
  },
```

3. В `renderDebugPage()` заменить ряд кнопок (строки 736-743) на две кнопки:

```js
      View({ style: S.btnRow }, [
        Button({
          label: 'Обновить',
          color: 'primary',
          style: S.btnHalfPrimary,
          onClick: () => this.requestDebugRefresh(),
        }),
        Button({
          label: 'Очистить',
          color: 'default',
          style: S.btnHalfDefault,
          onClick: () => this.clearDebug(),
        }),
      ]),
```

- [ ] **Шаг 4: Убедиться, что тесты проходят**

Run: `node --test test/settings-render.test.js`
Expected: PASS (все тесты файла)

- [ ] **Шаг 5: Коммит**

```bash
git add src/setting/index.js src/test/settings-render.test.js
git commit -m "feat: кнопка Очистить на странице Отладка"
```

---

### Задача 5: Полная проверка

- [ ] **Шаг 1: Прогнать весь тестовый набор**

Run: `cd src; node --test "test/*.test.js"`
Expected: PASS — все тесты (исходные 266 + новые), fail 0

- [ ] **Шаг 2: Убедиться в отсутствии регрессий по правилам шрифтов**

Изменения не затрагивают watch-UI и `ui-scale.js`/`sysText()`, поэтому дополнительные проверки шрифтов не требуются. Достаточно зелёного тестового набора.

- [ ] **Шаг 3: Коммит (если остались незакоммиченные правки)**

```bash
git status
git add -A
git commit -m "chore: финальная проверка очистки отладочных сообщений"
```
