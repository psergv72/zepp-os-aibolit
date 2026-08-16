# Дизайн: переход хранилища на easy-storage

Дата: 2026-08-16
Ветка: `feature/easy-storage`

## Цель

Заменить собственную реализацию хранилища (`src/utils/storage.js`) на библиотеку
`@silver-zepp/easy-storage` v2. Публичный API модуля хранения сохраняется, поэтому
страницы и утилиты не изменяются.

## Мотивация

- Отказ от `@zos/storage` (`LocalStorage`/`ShareLocalStorage`) и прямых импортов
  `@zos/fs` из `storage.js` — их полностью берёт на себя библиотека.
- Асинхронная запись через очередь `AsyncStorage` — UI не блокируется при записи.
- Исчезает ручное дублирование данных (сейчас `setItem` пишет и в LocalStorage,
  и в файл) и вся миграционная логика.

## Ограничения и решения

### Раздельные контексты app и app-service

В ZeppOS `app.js` (страницы) и `app-service/reminder.js` работают в раздельных
JS-контекстах с раздельной памятью. Общий слой между ними — файлы на диске.
Поэтому **единый JSON-блоб (EasyStorage/EasyStorageAsync) непригоден**: каждый
контекст держит свою копию в RAM и перезапишет чужой ключ. Это уже было причиной
перехода на по-ключевые файлы в `c914bab`.

Решение: по-ключевые файлы, как и сейчас.

### Асинхронность

Чтения в `build()` страниц и утилитах синхронные (~40 мест), сигнатуры менять
нельзя. Поэтому:

- **Чтение** — синхронное с диска через `Storage.ReadFile` + собственный
  синхронный NDJSON-парсер.
- **Запись** — асинхронная через `AsyncStorage.WriteJson` (очередь).

### Формат файлов

Библиотека `AsyncStorage.WriteJson` пишет файлы в собственном NDJSON-формате
(meta-строка + построчные записи массивов). Переходим **полностью** на NDJSON.

Миграции данных не нужны: полные данные (конфиг, история приёма) хранятся на
телефоне и заново загружаются при следующей синхронизации. Старые миграции
удаляются.

Известные потери при очистке хранилища на часах (не критично для эксперимента):
- локальные `cancellations` (отмены) — не мержатся обратно с телефона
  (`sync.js:48` принимает только `taken`);
- неотправленная очередь `syncQueue`;
- служебные id будильников — пересоздаются в `refreshAlarms`.

## Архитектура

### `src/utils/storage.js` — тонкий фасад

Импорты:
```js
import { AsyncStorage, Storage } from '@silver-zepp/easy-storage'
```

Сохраняется весь существующий публичный API и сигнатуры:
`getMedications/setMedications`, `getIntakes/setIntakes`, `getTakeLogs/setTakeLogs`,
`addTakeLog/removeTakeLog`, `getCancellations/setCancellations/addCancellation/
removeCancellation/isIntakeCancelled`, `getSettings/setSettings`, `getSyncQueue/
setSyncQueue/addToSyncQueue/clearSyncedItems`, `getTodayDateStr/getYesterdayDateStr`,
`pruneOldTakeLogs`, `clearAll`, `getConfigRevision/setConfigRevision`,
`getSyncAlarmId/setSyncAlarmId/clearSyncAlarmId`, `getSnoozeAlarmId/setSnoozeAlarmId/
clearSnoozeAlarmId`, `getRetryTickAlarmId/setRetryTickAlarmId`,
`getRetryTickCount/setRetryTickCount`, `getDebugLog/setDebugLog`,
`getAlarmRegistry/setAlarmRegistry/registerAlarm/unregisterAlarm`,
`getPendingNotification/setPendingNotification/clearPendingNotification`.

Имена файлов сохраняются:
```js
const FS_FILE_NAMES = {
  [STORAGE_KEYS.MEDICATIONS]:        'aibolit-key-medications.json',
  [STORAGE_KEYS.INTAKES]:            'aibolit-key-intakes.json',
  [STORAGE_KEYS.TAKE_LOGS]:          'aibolit-key-take-logs.json',
  [STORAGE_KEYS.CANCELLATIONS]:      'aibolit-key-cancellations.json',
  [STORAGE_KEYS.SETTINGS]:           'aibolit-key-settings.json',
  [STORAGE_KEYS.SYNC_QUEUE]:         'aibolit-key-sync-queue.json',
  [STORAGE_KEYS.CONFIG_REVISION]:    'aibolit-key-config-revision.json',
  [STORAGE_KEYS.SYNC_ALARM_ID]:      'aibolit-key-sync-alarm-id.json',
  [STORAGE_KEYS.SNOOZE_ALARM_ID]:    'aibolit-key-snooze-id.json',
  [STORAGE_KEYS.RETRY_TICK_ALARM_ID]: 'aibolit-key-retry-tick-id.json',
  [STORAGE_KEYS.ALARM_REGISTRY]:     'aibolit-key-alarm-registry.json',
}
const PENDING_FILE = 'aibolit-pending.json'
const DEBUG_LOG_FILE = 'aibolit-debuglog.json'
```

### Кэш только что записанного

```js
const pendingCache = new Map()
```

- `setItem(key, value)`: `pendingCache.set(key, value)`;
  `AsyncStorage.WriteJson(path, { [key]: value })` (файл хранит объект с одним ключом).
- `getItem(key, default)`: если в `pendingCache` — вернуть его; иначе синхронно
  `Storage.ReadFile(path)` + NDJSON-парсер → `parsed[key]`. Результат чтения с диска
  в кэш НЕ кладётся — это сохраняет свежесть между контекстами.
- `removeItem(key)`: удалить из `pendingCache`; синхронно `Storage.RemoveFile(path)`
  (удаление мгновенное, чтобы `getItem` не читал ещё существующий файл).
- `clear()`: очистить `pendingCache`; удалить все файлы через `Storage.RemoveFile`.

Кэш даёт мгновенную свежесть при паттерне «записал → прочитал» в том же контексте
и свежесть с диска для ключей, которые писал другой контекст.

Известное ограничение: асинхронная запись через `AsyncStorage.WriteJson` создаёт окно
гонки set→remove (запись из очереди может пересоздать файл, удалённый `removeItem`).
Сейчас вызовы set/remove разнесены во времени, поэтому окно не достигается.

### Синхронный NDJSON-парсер

Функция `parseNdJson(content)` — синхронная копия логики `#parseMultiSync` из
`easy-storage-async.js` (MIT): разбор meta-строки, полей и построчных массивов.
Используется для чтения файлов, записанных `AsyncStorage.WriteJson`.

### `onDestroy`

`AsyncStorage.SaveAndQuit()` — синхронный сброс очереди — добавляется в:
- `src/app.js` (`onDestroy`),
- `src/app-service/reminder.js` (`onDestroy`).

В страницах не добавляется: они закрываются при каждой навигации, синхронный
сброс там заблокировал бы UI без пользы.

## Удаляем

- `@zos/storage` и `migrateFromShareLocalStorage` — полностью.
- Прямые импорты `@zos/fs` из `storage.js`.
- Дублирование LocalStorage + файл — остаётся одна асинхронная запись.

## Тесты

### Stub `src/test/helpers/stubs/zos-fs.mjs`

Расширить под API, которое импортирует библиотека:
`openSync/readSync/writeSync/closeSync/mkdirSync/readdirSync/statSync/rmSync`
и константы флагов `O_RDONLY/O_CREAT/O_WRONLY/O_RDWR/O_TRUNC`.

### `src/test/storage.test.js`

Переписать:
- чтение/запись через NDJSON-парсер;
- без сидования `LocalStorage`;
- тесты «переживает сброс ShareLocalStorage» удалить (концепции больше нет).

### Остальные тесты

Проверить, что работают: `app.test.js`, `cancel-page.test.js`, `debug-log.test.js`,
`schedule.test.js`, `sync.test.js`, `watch-config.test.js`, `notification-lifecycle.test.js`
и прочие, зависящие от `storage.js` и stubs.

## Зависимости

- `src/package.json`: добавить `@silver-zepp/easy-storage` (версия 2.x) в
  `dependencies`.

## Критерии готовности

- `src/utils/storage.js` не импортирует `@zos/storage` и `@zos/fs`.
- Все существующие тесты проходят (`npm test` в `src`).
- Сборка через `zeus build`/`zeus preview` успешна.
