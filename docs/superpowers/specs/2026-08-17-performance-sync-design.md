# Дизайн: оптимизация производительности (синхронизация без навигации)

Дата: 2026-08-17
Статус: согласован

## Проблема

Приложение на часах долго загружается, а после загрузки несколько секунд
подтормаживает. Подтормаживание повторяется при переходе на экраны «Сегодня»
(home) и «План дня» (plan).

Причина подтверждена анализом кода: каждый `build()` страниц `home` и `plan`
выполняет два сетевых запроса к телефону:

1. `pullConfig()` → `fetchConfigFromSide()` — запрос `get_config` с ретраями
   до 6 попыток по 1 секунде (src/page/home/index.js:28-32,
   src/page/plan/index.js:39-43).
2. `pullTakes()` → `fetchTakesFromPhone()` — запрос `get_take_logs`
   (src/page/home/index.js:34-40, src/page/plan/index.js:45-51).

То есть на каждую навигацию приходится до двух сетевых раундов, а при недоступном
телефоне `pullConfig` ещё и висит в ретраях, что растягивает «тормоза» на секунды.

Дополнительные проблемы:

- На старте `onCreate` синхронно выполняет `refreshAlarms()` (дисковые чтения
  хранилища + возможное пересоздание будильников) до показа первой страницы
  (src/app.js:26).
- Логика получения конфига продублирована: `app.syncConfig()` (ретраи до 5)
  и `watch-config.fetchConfigFromSide()` (ретраи до 6) делают одно и то же.
- `fetchConfigFromSide()` возвращает факт получения ответа, а не факт применения
  конфига, поэтому `refreshAlarms()` вызывается даже когда конфиг не изменился.

## Цель

- Убрать сетевые запросы (`get_config` и `get_take_logs`) из навигации: переходы
  между экранами и старт работают только с локальными данными.
- Оставить синхронизацию только при старте приложения и по фоновому sync-тамеру,
  плюс при push-уведомлении об изменении настроек.
- Сделать синхронизацию неблокирующей: первый экран рендерится сразу из локального
  кеша, а конфиг/история/будильники обновляются в фоне.
- Не блокировать UI на старте тяжёлым `refreshAlarms()`.

## Подход

Избавиться от сетевых запросов в `build()` страниц, заменив их на локальную
подписку на изменения данных. Все входящие данные с телефона (конфиг, отметки
о приёме) собираются единой фоновой операцией `syncFromPhone()`, вызываемой из
точек старта/тик/пуш, и после применения уведомляют подписанные страницы через
лёгкую шину событий.

## Изменения

### 1. Новый модуль `src/utils/data-events.js` — шина событий данных

Локальная (без сети) подписка на факт изменения данных:

```js
export function subscribeToData(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export function emitDataChanged() {
  for (const fn of Array.from(listeners)) {
    try { fn() } catch (e) { /* игнорируем ошибки слушателя */ }
  }
}
```

`emitDataChanged()` вызывается только при реальном изменении из внешних
(фоновых) источников:

- `applyConfigToStorage()` — при применении конфига (после `setConfigRevision`);
- `applyConfigFromSettings()` — при применении зеркала из `settingsStorage`;
- `mergeTakeRecords()` — когда добавлены новые записи.

Локальные действия пользователя (`takeIntake` и т.п.) уже вызывают
`refreshView()` напрямую и событий не порождают.

### 2. Новый модуль `src/utils/sync-all.js` — оркестратор фоновой синхронизации

Единая фоновая операция получения данных с телефона. Вынесена в отдельный модуль,
чтобы не создавать цикл импортов: `watch-config.js` уже импортирует
`getMessaging` из `sync.js`, поэтому `sync.js` не должен импортировать
`watch-config.js`.

```js
import { fetchConfigFromSide } from './watch-config'
import { fetchTakesFromPhone, mergeTakeRecords } from './sync'
import { refreshAlarms } from './schedule'
import { getTodayDateStr } from './storage'

export function syncFromPhone(source = '') {
  return fetchConfigFromSide(source)
    .then((applied) => {
      if (applied) refreshAlarms()
      const todayDateStr = getTodayDateStr()
      return fetchTakesFromPhone(todayDateStr)
        .then((records) => { mergeTakeRecords(records) })
    })
    .catch(() => {})
}
```

- Направления зависимостей односторонние: `sync-all.js` → `watch-config.js`,
  `sync.js`, `schedule.js`, `storage.js`. Циклов нет.
- Вызов никогда не бросает исключений наружу (UI не блокирует).
- `mergeTakeRecords` при изменениях сам эмитит `data-changed`, поэтому страницы
  перерисуются.

### 3. `src/utils/watch-config.js` — возврат «применено»

`fetchConfigFromSide()` меняет `resolve`:

- было: `resolve(!!(result && result.config))` — факт получения ответа;
- стало: `resolve(applyConfigToStorage(result && result.config))` — факт применения.

Все текущие потребители (app.js, reminder.js, home, plan) на возвращаемое
значение либо не опираются, либо используют его как «что-то изменилось» — это
даст более точную семантику и позволит вызывать `refreshAlarms()` только при
реальном изменении.

### 4. `src/app.js` — лёгкий старт, единая точка синхронизации

`onCreate`:

```js
onCreate() {
  logger.log('app onCreate invoked')
  initSync(this.globalData && this.globalData.messaging)
  retrySync()
  if (applyConfigFromSettings()) {
    logger.log('config applied from settings on create')
  }
  setTimeout(() => {
    refreshAlarms()
    syncFromPhone('при старте')
  }, 0)
}
```

- Импорты: `syncFromPhone` — из `./utils/sync-all`, `refreshAlarms` — из
  `./utils/schedule` (уже импортирован), остальное без изменений.
- Тяжёлые `refreshAlarms()` и сетевые запросы вынесены за первый кадр
  (`setTimeout(0)`) — первая страница рендерится мгновенно из локального кеша.
- Метод `syncConfig()` удаляется: его роль выполняет `fetchConfigFromSide()`
  внутри `syncFromPhone()` (ретраи там уже есть).
- `onCall(CONFIG_SYNCED)` вместо `this.syncConfig(0, 'уведомление')` вызывает
  `syncFromPhone('уведомление')`.

### 5. `src/app-service/reminder.js` — sync-тик

Заменить:

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

Импорт `syncFromPhone` — из `../utils/sync-all`. `refreshAlarms()` при изменении
конфига вызывается внутри `syncFromPhone()`.

### 6. Страницы `src/page/home/index.js` и `src/page/plan/index.js`

- Убрать `pullConfig()` и `pullTakes()` из `build()`.
- Убрать неиспользуемые импорты: `fetchConfigFromSide` (из watch-config),
  `fetchTakesFromPhone`, `mergeTakeRecords` (из sync).
- Добавить импорт `subscribeToData` из `../../utils/data-events`.
- В `build()` подписаться:

```js
build() {
  logger.log('home page build')
  this._destroyed = false
  this.refreshView()
  this._offData = subscribeToData(() => this.refreshView())
}
```

- В `onDestroy()` отписаться:

```js
onDestroy() {
  logger.log('home page onDestroy')
  this._destroyed = true
  if (this._offData) this._offData()
  if (this.ui) this.ui.clear()
}
```

- Обновление экрана после стартовой/фоновой синхронизации приходит через событие
  (пока страница жива). Если событие пришло до подписки — страница при рендере
  прочитает уже актуальные данные из кеша.

## Обработка ошибок

- `syncFromPhone()` оборачивает цепочку в `.catch(() => {})`: обрыв связи или
  ошибка side service не роняют старт приложения и не ломают навигацию.
- Существующие ретраи внутри `fetchConfigFromSide()` сохраняются, но теперь
  работают только в точках старт/тик/пуш, а не при каждой навигации.
- Потерянное событие (страница ещё не подписалась) безопасна: страница при
  отрисовке всегда читает актуальный кеш хранилища.

## Тестирование

- `src/test/app.test.js`:
  - переписать тесты `syncConfig` под новую реальность (у метода больше нет);
  - `onCall(CONFIG_SYNCED)` вызывает `syncFromPhone`/`fetchConfigFromSide`
    (запрос `get_config` уходит, payload не применяется напрямую);
  - отладочный лог при `CONFIG_SYNCED` по-прежнему пишется.
- `src/test/sync-all.test.js` (новый):
  - `syncFromPhone`: запрашивает `get_config` и `get_take_logs`;
  - при применённом конфиге вызывает `refreshAlarms`, при нетронутом — нет;
  - не бросает исключений при обрыве связи.
- `src/test/data-events.test.js` (новый):
  - подписка/отписка, эмит вызывает слушателя;
  - ошибка в одном слушателе не ломает остальных;
  - `applyConfigToStorage`/`applyConfigFromSettings`/`mergeTakeRecords` эмитят
    событие при применении/изменении.
- `src/test/home-page-render.test.js` / `plan-page-render.test.js`:
  - новый тест: `build()` страницы не делает сетевых запросов (мок
    `getMessaging`/`getApp` не вызывается);
  - подписка в `build()` и отписка в `onDestroy()` работают (после отписки эмит
    не вызывает `refreshView` уничтоженной страницы).
- `src/test/watch-config.test.js`:
  - существующие тесты `fetchConfigFromSide` должны пройти (возврат теперь —
    результат `applyConfigToStorage`; проверить случаи с новой ревизией).
