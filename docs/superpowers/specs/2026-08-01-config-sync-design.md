# Дизайн: Доставка конфигурации из companion на часы (fix Замечания)

Дата: 2026-08-01
Ветка: `feature/intake-groups`

## Цель

Устранить предсуществующий пробел: конфигурация (лекарства, приёмы, настройки), введённая в companion-настройках на телефоне, не доставлялась в хранилище часов (`ShareLocalStorage`). Дополнительно подключить ранее неиспользуемый `refreshAlarms()`.

## Механизм

Проверено по `@zeppos/zml` (пример helloworld3): `onSettingsChange` в `BaseSideService` срабатывает при любом изменении `settings.settingsStorage`. `ShareLocalStorage` разделяется между watch-приложением и app-side. App-side может слать сообщения в watch-приложение через `this.call()` → `onCall` в `BaseApp`.

Подход — **Push через `onSettingsChange` + live-уведомление** (выбран в brainstorm).

## Поток данных

1. Companion сохраняет лекарства/приёмы/настройки → `settingsStorage` (ключи `medications`, `intakes`, `settings`).
2. App-side `onSettingsChange` (ключ в `CONFIG_KEYS`) → читает три ключа через `this.settings.getItem`, парсит (`parseSettingsItem`), пишет объекты в `ShareLocalStorage('aibolit-data.json')` → `this.call({ method: CONFIG_SYNCED })`.
3. Watch-приложение `onCall(CONFIG_SYNCED)` → `refreshAlarms()`.
4. Watch-приложение `onCreate()` → `refreshAlarms()` (страховка при пропущенном сообщении).
5. Страницы (home/plan) читают конфиг из `ShareLocalStorage` — уже работает без изменений.

## Изменения

### `src/utils/constants.js`
- В `ZML_METHODS` добавить `CONFIG_SYNCED: 'config_synced'`.

### `src/utils/config-sync.js` (новый чистый модуль)
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

### `src/app-side/index.js`
- Добавить `onSettingsChange({ key })`: если `key` в `CONFIG_KEYS` → `pushConfigToWatch()`.
- В `onRun()`: после старта вызвать `pushConfigToWatch()`.
- `pushConfigToWatch()`:
  1. Для каждого ключа из `CONFIG_KEYS`: `const raw = this.settings.getItem(key)`, `const val = parseSettingsItem(raw)`; если `val !== null` → `storage.setItem(key, val)`.
  2. `storage = new ShareLocalStorage('aibolit-data.json')` (создаётся один раз).
  3. `this.call({ method: ZML_METHODS.CONFIG_SYNCED })`.
- Импорты: `ShareLocalStorage` из `@zos/storage`, `ZML_METHODS` из `../utils/constants`, `CONFIG_KEYS`/`parseSettingsItem` из `../utils/config-sync`.
- Существующая логика (`SYNC_INTAKE`, `SYNC_CANCELLATION`) не меняется.

### `src/app.js`
- `onCreate()`: добавить `refreshAlarms()`.
- Добавить `onCall(data)`: если `data.method === ZML_METHODS.CONFIG_SYNCED` → `refreshAlarms()`.
- Импорты: `refreshAlarms` из `./utils/schedule`, `ZML_METHODS` из `./utils/constants`.
- Остальное (`onDestroy`, `globalData`) без изменений.

## Краевые случаи

1. Невалидный JSON / `null` в `settingsStorage` → `parseSettingsItem` → `null` → ключ пропускается.
2. Пустой конфиг → пустые массивы в `ShareLocalStorage`; `refreshAlarms` отменяет все алarmы.
3. `onSettingsChange` по прочим ключам (`history_*`, служебные) → игнорируются.
4. `onCall` с незнакомым method → игнорируется.
5. `ShareLocalStorage` на app-side и watch — один файл `aibolit-data.json`.
6. Сообщение пропущено (приложение закрыто) → страховка `refreshAlarms()` в `onCreate`.

## Тестирование

- Unit (`node:test`, `src/test/config-sync.test.js`): `parseSettingsItem` — строка-объект, объект, `null`/`undefined`, невалидный JSON → `null`; `CONFIG_KEYS` содержит три ключа.
- Сборка: `zeus build -t "Amazfit Balance 2"` — успех.
- Ручной сценарий (устройство): изменение конфига в companion → отображение на часах при открытии; live-обновление алarmов при открытом приложении.
