# Обмен данными между телефоном и часами (Aibolit)

Дата: 2026-08-06
Ветка: `docs/data-sync-research`

Этот документ — справочник по каналам, триггерам и форматам передачи данных
между companion-приложением на телефоне и мини-приложением на часах. Используется
как основа при разработке и отладке синхронизации.

## Архитектура

```
Телефон:
  setting/index.js  (AppSettingsPage UI)  <->  settings.settingsStorage  <->  app-side/index.js (SideService)
                                                                                        |
                                                                                    BLE / ZML
                                                                                        |
Часы:
  app.js (BaseApp)  <->  app-service/reminder.js  <->  ShareLocalStorage('aibolit-data.json')
       |
   page/home, page/plan, page/take, page/snooze
```

- **Phone storage**: `settings.settingsStorage` (общий для UI настроек и side service).
- **Watch storage**: `ShareLocalStorage('aibolit-data.json')` (`src/utils/storage.js`).
- Транспорт: `@zeppos/zml` — `request/response` (запрос-ответ) и `call` (push-уведомление).

## Протокольные методы (src/utils/constants.js, ZML_METHODS)

| Константа | Метод | Направление | Транспорт | Статус |
|-----------|-------|-------------|-----------|--------|
| `SYNC_INTAKE` | `sync_intake` | часы → телефон | request | используется |
| `SYNC_CANCELLATION` | `sync_cancellation` | часы → телефон | request | используется |
| `GET_TAKE_LOGS` | `get_take_logs` | часы → телефон | request | используется |
| `GET_CONFIG` | `get_config` | часы → телефон | request | используется |
| `CONFIG_SYNCED` | `config_synced` | телефон → часы | call | используется |
| `UNDO_TAKE` | `undo_take` | — | — | **объявлен, не используется** |
| `RESTORE_INTAKE` | `restore_intake` | — | — | **объявлен, не используется** |

Обработчик запросов — `app-side/index.js` → `onRequest(req, res)`.
Приём push — `app.js` → `onCall(data)`.

## Телефон → Часы (конфигурация)

Передаются три ключа: `medications`, `intakes`, `settings` (полный снимок, целиком).

### Push-уведомление (call, `config_synced`)

Источник: `app-side/index.js` → `pushConfigToWatch()`.

Триггеры:
1. `onRun()` side service — старт фонового сервиса на телефоне (companion
   подключается к часам).
2. `onSettingsChange({key})` — если `key` входит в `CONFIG_KEYS`
   (`['medications', 'intakes', 'settings']`), т.е. пользователь изменил
   лекарства/приёмы/настройки в приложении Zepp на телефоне.

Действие push:
```js
this.call({ method: 'config_synced', params: { config } })
```
Приём на часах: `app.js` `onCall(CONFIG_SYNCED)` → `applyConfigToStorage(config)`
+ `refreshAlarms()`.

### Pull-запрос (request, `get_config`)

Источники на часах:
1. `app.js` `onCreate()` → `syncConfig()` — запрос с ретраями до 5 попыток
   (интервал 1 с).
2. `watch-config.js` `fetchConfigFromSide()` — вызывается из страниц
   **home** и **plan** в `build()` (`pullConfig()`), до 6 попыток с интервалом 1 с.
3. `watch-config.js` `applyConfigFromSettings()` — читает конфиг из
   `settings.settingsStorage` напрямую (обход request), если storage доступен.

Ответ side service: `res(null, { config })`.

### Общий результат
- `applyConfigToStorage()` пишет `medications`, `intakes`, `settings` в
  `ShareLocalStorage` часов и (для `onCall`) перестраивает будильники.
- Отправляется **весь** конфиг, а не дельта.

## Часы → Телефон (записи о приёме)

### `sync_intake` (записи taken/snoozed/cancelled/undone)

Триггеры (пользовательские действия на часах):
| Место | Сценарий | Функция |
|-------|----------|---------|
| `page/take` | кнопка «Принял» в уведомлении | `takeIntake()` |
| `page/home` | чекбокс приёма | `takeIntake()` |
| `page/plan` | чекбокс приёма | `takeIntake()` |
| `page/snooze` | выбор «Отложить на N мин» | `confirmSnooze()` |
| `page/plan` | long-press (1 с) на чекбоксе невзятого приёма | `cancelIntake()` |
| `page/plan` | повторный тап по галке взятого приёма (undo) | `undoIntake()` |

Механика (`utils/sync.js`):
1. `sendTakeLogToPhone(takeLog)` / `sendCancellationToPhone(intakeId, date)` /
   `sendUndoTakeToPhone(intakeId, date)` → `addToSyncQueue(record)` +
   `scheduleSync()` (мьютекс).
2. `trySyncNow()` отправляет **всю очередь** одним запросом
   `{ method: 'sync_intake', params: { records } }`.
3. При успехе: `clearSyncedItems(ids)` (очистка очереди) + `pruneOldTakeLogs()`
   (локальные логи обрезаются до сегодня+вчера).
4. При неудаче: записи остаются в `syncQueue`.

Приём на телефоне (`onRequest` `SYNC_INTAKE`):
- записи `taken`/`snoozed`/`cancelled` дописываются в
  `settings.settingsStorage` под ключ `history_${record.date}` (дедуп по `id`,
  last-write-wins по паре `(intakeId, date)`);
- записи `undone` **удаляют** из `history_${date}` записи `taken` с той же парой
  (история остаётся чистой, приём считается не принятым).

Повторная отправка накопленной очереди: `retrySync()` вызывается в `app.js`
`onCreate()` и в фоновом тике `mode:'sync'`.

### `get_take_logs` (вытягивание истории)

Триггер: страницы **home** и **plan** в `build()` (`pullTakes()`) → запрашивают
записи за сегодня.

- Ответ: `res(null, { records })` из `history_${date}` на телефоне.
- На часах: `mergeTakeRecords(records)` — добавляет в `takeLogs` только записи
  со `status === 'taken'`, отсутствующие локально (по `id`). Записи `taken`,
  для которых в `syncQueue` есть ещё не отправленный `undone` той же пары,
  игнорируются (чтобы не «воскрешать» галку до доставки отмены).
- Цель: восстановить состояние «взято», если действие было отмечено на телефоне
  (например, из другого источника).

## Периодичность

**Периодической (фоновой, по таймеру) синхронизации нет.**

- Настройка `syncInterval` (по умолчанию 60 мин) присутствует в `DEFAULT_SETTINGS`
  и на странице настроек телефона (`setting/index.js`), но **не используется
  в коде**: нет ни одного `setInterval`/`setTimeout`, связанного с ней.
- Все передачи — **событийные**:

| Событие | Передача |
|---------|----------|
| Старт side service (телефон) | push `config_synced` |
| Изменение `medications`/`intakes`/`settings` в настройках телефона | push `config_synced` |
| Запуск приложения на часах (`onCreate`) | request `get_config` + `retrySync()` очереди |
| Фоновый тик sync-alarm (`mode:'sync'`, каждые `syncInterval` мин) | `applyConfigFromSettings` + `refreshAlarms` + `retrySync()` |
| Открытие страницы home/plan | request `get_config` + request `get_take_logs` |
| Действие «принял» / «отложить» / «отменить» / «снять принятие» (take, home, plan, snooze) | request `sync_intake` (вся очередь) |

- Единственные повторы — ретраи по запросу с интервалом 1 с:
  - `app.syncConfig()`: до 5 попыток.
  - `fetchConfigFromSide()`: до 6 попыток.
  - `app.onCreate()`: разовый `retrySync()` для накопленной очереди.
- Записи, не доставленные из-за отсутствия связи, живут в `syncQueue` до
  следующего `sendTakeLogToPhone` (попытка вместе с новыми) или следующего запуска.

## Хранилища и данные

### settingsStorage (телефон, JSON-строки)

| Ключ | Содержимое |
|------|-----------|
| `medications` | JSON-массив лекарств |
| `intakes` | JSON-массив приёмов |
| `settings` | JSON-объект настроек |
| `history_YYYY-MM-DD` | JSON-массив записей приёма/отмен за дату |

### ShareLocalStorage 'aibolit-data.json' (часы)

| Ключ | Содержимое |
|------|-----------|
| `medications` | массив лекарств |
| `intakes` | массив приёмов |
| `settings` | объект настроек |
| `takeLogs` | локальные записи приёма (обрезаются до сегодня+вчера) |
| `cancellations` | локальные отмены `{intakeId, date}` |
| `syncQueue` | очередь записей на отправку `sync_intake` |

### Форматы объектов

Лекарство:
```json
{ "id": "...", "name": "Аспирин", "dosage": "100 мг", "comments": "После еды", "enabled": true }
```

Приём (intake):
```json
{ "id": "...", "time": "08:00", "weekDays": [1,2,3,4,5], "label": "Утро",
  "items": [ { "medicationId": "...", "amount": "1 таб" } ] }
```
`weekDays`: 1=Пн … 7=Вс; `null`/пусто = каждый день.

Настройки:
```json
{ "retryInterval": 60, "syncInterval": 60, "snoozeOptions": [30,45,60,90], "minFontSize": 16 }
```

Запись о приёме (take log, на часах и в истории телефона):
```json
{ "id": "log_...", "intakeId": "...", "date": "2026-08-05", "time": "08:00",
  "takenTime": "08:05", "status": "taken", "items": [ { "medicationId": "...", "amount": "1 таб" } ] }
```
`status`: `taken` | `snoozed` | `cancelled` | `undone`. (В истории телефона
хранятся `taken`/`snoozed`/`cancelled`; `undone` в историю не пишется — он
удаляет `taken` пары.)

## Замечания для дальнейшей работы

1. `syncInterval` реализован как фоновый sync-alarm (`REPEAT_MINUTE`) — будит
   `app-service/reminder.js` с `mode:'sync'`, который применяет конфиг,
   пересоздаёт будильники и ретраит очередь.
2. Отмена приёма и снятие принятия (undo) встают в очередь `sync_intake`
   (`cancelled`/`undone`) и переживают обрыв связи.
3. Восстановление отмены («вернуть прием») на часах не синхронизируется с
   телефоном (метод `restore_intake` объявлен, но не реализован).
4. `get_take_logs` запрашивается только при открытии home/plan — после закрытия
   приложения новые записи с телефона подтянутся только при следующем открытии.
5. `mergeTakeRecords` на часах игнорирует не-`taken` записи и записи `taken`,
   для которых в очереди есть неотправленный `undone` той же пары.
