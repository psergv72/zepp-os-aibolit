# Дизайн: Надёжность синхронизации между телефоном и часами

Дата: 2026-08-06
Ветка: `docs/data-sync-research`

## Цель

Устранить проблемы синхронизации Aibolit, выявленные при анализе обмена данными
между телефоном (companion) и часами:

1. **Потери данных** — в т.ч. затирание новых данных более старыми.
2. **Конкурентность** — сериализация отправки, идемпотентность приёма.
3. **Доставка настроек без запуска приложения на часах** — фоновое
   применение конфигурации и пересоздание будильников.

## Контекст

- Конфиг (medications, intakes, settings) живёт в `settings.settingsStorage` на
  телефоне и автоматически синхронизируется системой Zepp OS на устройство.
- Часы имеют глобальный `settings.settingsStorage` и `applyConfigFromSettings()`,
  читающий его напрямую (без BLE).
- Записи приёма уходят с часов через ZML `request` (`sync_intake`).
- Alarm → app-service канал уже работает (`app-service/reminder.js`).

## Проблемы

### П1. Затирание конфига старым снимком
`pushConfigToWatch()` шлёт полный снимок без ревизии. Два пути доставки
(push `config_synced`, pull `get_config`) + чтение напрямую
(`applyConfigFromSettings()`) могут применить более старый снимок поверх нового.

### П2. Дубликаты и потери записей приёма
- `app-side onRequest(SYNC_INTAKE)` делает `history.push(record)` без проверки
  существующего `id` → дубликаты при повторной отправке очереди.
- `trySyncNow()` не сериализован → два вызова `sendTakeLogToPhone()` подряд
  могут запустить две параллельные отправки одной очереди.
- `SYNC_CANCELLATION` не встаёт в очередь → теряется при обрыве связи.

### П3. Настройки не доходят при закрытом приложении
Push `config_synced` принимается `app.onCall` только при запущенном приложении.
`syncConfig()`/`retrySync()` вызываются только из `onCreate`. При закрытом
приложении `refreshAlarms()` не выполняется → новые настройки и будильники
не применяются.

## Решения

### С1. Ревизия конфига

**Телефон** (`src/app-side/index.js`):
- Служебный ключ `configRevision` в `settings.settingsStorage`
  (монотонный счётчик, старт с 1).
- `onSettingsChange({key})`: если `key` в `CONFIG_KEYS` →
  `configRevision = (getItem('configRevision') || 0) + 1`, затем
  `pushConfigToWatch()`.
- `onRun()`: `pushConfigToWatch()` (с актуальной ревизией).
- `buildConfig()` возвращает
  `{ medications, intakes, settings, revision: configRevision }`.
- `pushConfigToWatch()` передаёт полный объект в `config_synced` (уже так).

**Часы** (`src/utils/watch-config.js`, `src/utils/storage.js`):
- В `ShareLocalStorage` новый ключ `configRevision` (начальное значение 0).
- `applyConfigToStorage(config)`:
  - если `config` нет или `typeof config.revision !== 'number'` → `false`;
  - если `config.revision <= getConfigRevision()` → `false` (старое/равное);
  - иначе применить medications/intakes/settings и сохранить ревизию → `true`.
- `applyConfigFromSettings()` — читает конфиг из `settings.settingsStorage`
  (ключи medications/intakes/settings + `configRevision`) и применяет по тому же
  правилу ревизии. Это связывает оба пути единым правилом (важно для фонового
  тика без BLE).

Правило конфликта: **последний по ревизии снимок выигрывает**.

### С2. Единая очередь + мьютекс + идемпотентность

**Часы** (`src/utils/sync.js`):
- Все события (taken/snoozed/cancelled) пишутся в единую `syncQueue`.
- `sendCancellationToPhone(intakeId, date)` вместо прямого `sync_cancellation`
  добавляет в очередь запись
  `{ id: 'cancel_...', intakeId, date, status: 'cancelled' }` → `scheduleSync()`.
- Мьютекс:
  ```
  scheduleSync():
    if (syncing) { pendingSync = true; return }
    syncing = true
    trySyncNow().finally(() => {
      syncing = false
      if (pendingSync) { pendingSync = false; scheduleSync() }
    })
  ```
- `trySyncNow()` отправляет всю очередь одним `sync_intake`;
  при успехе — `clearSyncedItems`, `pruneOldTakeLogs`.
- `retrySync()` остаётся (пустая очередь — ничего не шлёт).

**Телефон** (`src/app-side/index.js` `onRequest(SYNC_INTAKE)`):
- Дедупликация по `id`: запись добавляется в `history_<date>` только если там
  нет записи с таким `id`.
- Правило конфликта (intakeId, date): запись с тем же `intakeId`+`date`
  (независимо от статуса) заменяется последней. Последнее действие — истина.
- Старый метод `sync_cancellation` удаляется из обработки (или остаётся
  заглушкой «unknown method»).

### С3. Фоновый sync-alarm и тик

**Часы** (`src/utils/schedule.js`):
- Новый ключ `syncAlarmId` в `ShareLocalStorage`.
- `createSyncAlarm(syncInterval)`:
  - если существует старый sync-alarm — отменить;
  - `setAlarm({ url: 'app-service/reminder', repeat_type: REPEAT_MINUTE,
    repeat_period: syncInterval, param: JSON.stringify({ mode: 'sync' }) })`;
  - сохранить id.
- `refreshAlarms()`:
  - сохранить id sync-alarm, отменить **все остальные** alarm-ы;
  - создать intake alarm-ы;
  - пересоздать sync-alarm по актуальному `syncInterval`
    (`getSettings().syncInterval || 60`).

**Фоновый сервис** (`src/app-service/reminder.js`):
- В `handleEvent(e)` при `mode === 'sync'`:
  - `applyConfigFromSettings()` (применяет конфиг по правилу ревизии);
  - `refreshAlarms()`;
  - `retrySync()`;
  - вернуться без уведомления.
- Импорты `retrySync` из `../utils/sync`, `applyConfigFromSettings` из
  `../utils/watch-config`.

## Краевые случаи

1. `configRevision` отсутствует на телефоне (старая установка) → `0`;
   первый push с `revision >= 1` применится.
2. Часы без сохранённой ревизии (`getConfigRevision() === 0`) → любой
   `revision > 0` применяется.
3. Очистка storage на часах → ревизия сбрасывается к 0, следующий снимок
   применяется заново.
4. Дубликат на телефоне при повторной отправке → исключён дедупом по `id`.
5. Отмена переживает обрывы связи (в очереди).
6. Конфликт taken/cancelled на (intakeId, date) → заменяется последней записью.
7. Sync-alarm не должен быть отменён `refreshAlarms` (исключение по id).
8. `mode:'sync'` не шлёт уведомление.
9. Приложение не открывалось ни разу — sync-alarm не создан (допустимо;
   требование — не открывать *после* первой установки).

## Изменяемые файлы

- `src/app-side/index.js` — ревизия, дедуп, правило конфликта.
- `src/utils/config-sync.js` — (возможно) константа `CONFIG_REVISION`.
- `src/utils/watch-config.js` — ревизия в `applyConfigToStorage`/
  `applyConfigFromSettings`.
- `src/utils/storage.js` — геттеры/сеттеры `configRevision`, `syncAlarmId`.
- `src/utils/sync.js` — единая очередь, мьютекс, отмена в очередь.
- `src/utils/schedule.js` — `createSyncAlarm`, доработка `refreshAlarms`.
- `src/app-service/reminder.js` — обработка `mode:'sync'`.
- `src/utils/constants.js` — (возможно) `ALARM_MODES.SYNC`.

## Тестирование

- Расширить `src/test/config-sync.test.js`, `src/test/sync.test.js`,
  `src/test/schedule.test.js`, `src/test/reminder-service.test.js`.
- Новый тест для `app-side` дедупа (отдельный стаб `AppSideService`/`settings`).
- Запуск: `node --test` из `src`.
- Сборка: `zeus build -t "Amazfit Balance 2"` из `src`.
- Ручной сценарий: изменить настройки на телефоне при закрытом приложении на
  часах → в течение `syncInterval` будильники пересоздаются и новые настройки
  применяются.
