# Дизайн: кнопка «Очистить» на странице «Отладка»

Дата: 2026-08-09
Статус: согласован

## Проблема

На странице «Отладка» приложения для телефона есть кнопка «Обновить», которая
запрашивает с часов свежий снимок отладочных сообщений (`debugInfo`). Но нет
способа очистить отладочный лог. Отладочный лог хранится на часах в storage под
ключом `debugLog` (не более 100 последних записей) и накапливается, пока включён
отладочный режим.

## Цель

Кнопка «Очистить» на странице «Отладка» телефона должна:

- очистить лог отладочных сообщений на часах (чтобы при следующем «Обновить»
  лог остался пустым);
- сразу очистить отображаемый на телефоне снимок `debugInfo`.

## Подход

Полный цикл по образцу существующего механизма «Обновить»:
телефонная кнопка пишет ключ в phone settings → side service замечает изменение
`onSettingsChange` и вызывает часы через `this.call({ method })` → часы
обрабатывают метод в `App.onCall`.

Очистка самого лога на часах уже реализована: `clearDebugLog()` в
`src/utils/debug-log.js` — просто используем её.

## Изменения

### 1. `src/utils/constants.js`

Добавить метод в `ZML_METHODS`:

```js
CLEAR_DEBUG: 'clear_debug',
```

### 2. `src/app.js` (часы)

- Дополнить импорт из `./utils/debug-log` функцией `clearDebugLog`.
- В `onCall` добавить обработку:

```js
if (data && data.method === ZML_METHODS.CLEAR_DEBUG) {
  clearDebugLog()
}
```

### 3. `src/app-side/index.js` (side service телефона)

В `onSettingsChange` добавить обработку ключа `debugClear` до проверки
`CONFIG_KEYS` (по аналогии с `debugRefresh`):

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

### 4. `src/setting/index.js` (настройки телефона)

- Добавить `debugClear: 'debugClear'` в телефонные `STORAGE_KEYS`.
- Новый метод `clearDebug()` (повторяет паттерн `requestDebugRefresh`,
  src/setting/index.js:630):

```js
clearDebug() {
  this.storage().removeItem(STORAGE_KEYS.debugInfo)
  this.state.debugWaiting = false
  this.state.debugTimedOut = false
  const prev = this.storage().getItem(STORAGE_KEYS.debugClear)
  const next = (prev ? Number(prev) : Date.now()) + 1
  this.storage().setItem(STORAGE_KEYS.debugClear, String(next))
  this.forceRender()
}
```

Ключ `debugClear` инкрементируется как и `debugRefresh`, чтобы изменение значения
всегда фиксировалось side service.

- В `renderDebugPage()` добавить вторую кнопку в ряд кнопок:

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

## Обработка ошибок

- Если часы недоступны, их лог не очистится, но телефонный снимок очистится
  немедленно. При следующем «Обновить» старые сообщения вернутся — пользователь
  увидит, что очистка на часы не доехала. Для отладочного инструмента достаточно.
- Вызов `this.call` в side service оборачиваем в try/catch, как это сделано в
  `requestDebugSnapshot` (src/app-side/index.js:33), чтобы сбой связи не ронял
  side service.

## Тестирование

- `src/test/app-side.test.js`:
  - `onSettingsChange` для `debugClear` вызывает часы с методом `clear_debug`;
  - `onSettingsChange` для `debugClear` не трогает ревизию конфига.
- `src/test/app.test.js`:
  - `onCall` с `clear_debug` очищает `debugLog` на часах (лог пуст после вызова).
- `src/test/settings-render.test.js`:
  - кнопка «Очистить» присутствует на странице «Отладка»;
  - клик по «Очистить» очищает `debugInfo` и меняет значение `debugClear`;
  - клик по «Очистить» не запускает ожидание ответа часов (`debugWaiting` = false).
