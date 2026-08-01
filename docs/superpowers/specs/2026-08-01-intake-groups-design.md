# Дизайн: Сущность «Прием лекарства» (intakes) вместо расписания у лекарства

Дата: 2026-08-01
Ветка: `feature/intake-groups`

## Цель

Изменение структуры данных приложения Айболит (ZeppOS):

- Лекарство больше **не имеет** расписания приёма.
- Вводится сущность **«Прием лекарства»**: время (с указанием дней недели) + список лекарств, каждое с количеством, которое нужно принять в этот раз.

## Модель данных

### `medications` (ключ `medications`) — форма не меняется

```
{ id, name, dosage, comments, enabled }
```

- `dosage` — сила таблетки, описательное поле (например «10мг»).
- Количество «за раз» хранится не здесь, а в items приёма.

### `intakes` (ключ `intakes`) — новая сущность «Прием лекарства», заменяет старый `schedule`

```
{
  id,                  // уникальный
  time,                // 'ЧЧ:ММ'
  weekDays,            // [1..7] или null = каждый день
  label,               // опционально: 'утро', 'день', ...
  items: [             // список лекарств к приёму
    { medicationId, amount }   // amount: «2 таблетки», «5 капель»
  ]
}
```

### `takeLogs` (ключ `takeLogs`) — записи факта приёма, переименование из `intakes`, одна запись на приём

```
{
  id,          // 'log_' + timestamp
  intakeId,    // ссылка на приём
  date,        // 'ГГГГ-ММ-ДД'
  time,        // запланированное время (снимок)
  takenTime,   // фактическое 'ЧЧ:ММ'
  status,      // taken | snoozed | skipped | cancelled
  items: [ { medicationId, amount } ]   // снимок состава на момент приёма
}
```

Снимок `items` нужен, чтобы история не ломалась при последующем редактировании приёма.

### `cancellations` — `{ intakeId, date }` (вместо `scheduleId`)

## Уровень хранения и константы

### `utils/constants.js`

- `STORAGE_KEYS`:
  - `SCHEDULE: 'schedule'` → `INTAKES: 'intakes'`
  - `INTAKES: 'intakes'` → `TAKE_LOGS: 'takeLogs'`
- `ZML_METHODS`:
  - `SYNC_SCHEDULE` — удаляется (не используется).
  - `UNDO_INTAKE` → `UNDO_TAKE`, `RESTORE_SLOT` → `RESTORE_INTAKE` (терминология).
  - `SYNC_INTAKE`, `SYNC_CANCELLATION` — остаются.

### `utils/storage.js` — переименование функций, логика не меняется

- `getSchedule`/`setSchedule` → `getIntakes`/`setIntakes` (сущность «Прием»).
- `getIntakes`/`setIntakes`/`addIntake`/`removeIntake` → `getTakeLogs`/`setTakeLogs`/`addTakeLog`/`removeTakeLog`.
- `isSlotCancelled` → `isIntakeCancelled`; параметр `scheduleId` → `intakeId` в cancellation-функциях.
- `pruneOldIntakes` → `pruneOldTakeLogs`.

### `app-side/index.js`

- `SYNC_CANCELLATION` пишет `{ intakeId, date, status: 'cancelled' }`.
- `SYNC_INTAKE` без изменений (складывает takeLog в `history_<date>`).

## Настройки (`setting/index.js`)

### Страница «Лекарства» (`list`)

- Строка: название + dosage. Подпись «N приемов» → «в N приёмах» (количество приёмов, где лекарство в items). Если нигде — без подписи.
- Кнопки: «+ Добавить лекарство», **«Приёмы»**, «История», «Настройки».

### Страница редактирования лекарства (`edit`)

- Поля: название, дозировка, комментарии, активно.
- Кнопка «Расписание» **удаляется**.

### Страница «Приёмы» (`intakes`) — новая, глобальный список всех приёмов

- Строка: `label/time — time`, подпись — дни недели + краткий состав (например «Пн, Ср, Пт · Парацетамол ×2, Аспирин ×1»).
- Кнопки: «+ Добавить приём», «Назад».

### Страница редактирования приёма (`intakeEdit`) — новая

- Поля: время, метка, «Каждый день» (toggle), выбор дней недели (select multiple).
- Блок «Лекарства»: список items; строка `Название × amount` с кнопкой удаления и тапом для редактирования; кнопка «+ Добавить лекарство» → подстраница `itemEdit`.
- Подстраница `itemEdit`: select лекарства + text input «Количество» (например «2 таблетки») + Сохранить.
- Кнопки: Сохранить, Удалить (для существующего), Назад.

### Страница «История» (`history`)

- Формат строки: `time — statusText`, под ней состав приёма (`name × amount` из takeLog.items). Дата-инпут остаётся.

### Страница «Настройки» — без изменений.

## Экраны часов и Snooze

### `page/home` (ближайшие приёмы)

- Источник — массив `intakes`.
- Фильтры те же: время ≥ текущего, день недели в weekDays (или каждый день), не принято и не отменено сегодня.
- Строка приёма: заголовок `── time ──`, ниже items: `Название × amount`.
- «Принять» (чекбокс) → **одна** запись `takeLog` со снимком items.

### `page/plan` (план на сегодня)

- Без фильтра «≥ текущего времени» (весь день).
- Take / undo / cancel / restore действуют на целый приём:
  - take → одна `takeLog` (status taken)
  - undo → удаление takeLog за today по intakeId
  - cancel → `cancellations: { intakeId, date }`
  - restore → удаление cancellation
- Отображение времени и состава `name × amount`.

### `page/snooze`

- Вместо `medicationName + dosage` — заголовок приёма: `label` или `time`, под ним состав `name × amount`.
- Выбор задержки → `snooze-handler` создаёт snooze-алarm для всего приёма + `takeLog` (status `snoozed`, снимок items).

### `app-service/reminder`

- Параметр алarма: `{ mode, intakeId }` (без снимка медикаментов).
- Содержимое уведомления формируется из `getIntakes().find(id)` по items; если приём удалён — не показывать.
- Проверки «уже принят»/«отменён» — по `intakeId`.

### `utils/schedule.js`

- `createSlotAlarm(slot, medication)` → `createIntakeAlarm(intake)`: маска дней из `intake.weekDays`, param `{ mode, intakeId }`.
- `createRetryAlarm`/`createSnoozeAlarm` → параметр `intakeId`.
- `refreshAlarms()`: пропускает приёмы, у которых все items-лекарства отключены (`enabled=false`); уважает cancellations/takeLogs.

## Синхронизация

### `utils/sync.js`

- `sendIntakeToPhone` → `sendTakeLogToPhone(takeLog)` (очередь + SYNC_INTAKE).
- `sendCancellationToPhone(scheduleId, date)` → `sendCancellationToPhone(intakeId, date)`.

### `app-service/take.js`

- Параметр уведомления `{ intakeId }`; загружает приём из storage, создаёт одну `takeLog` со снимком items и `time`.

## Краевые случаи

1. Приём, где все лекарства отключены/удалены → пропускается в алармах и на экранах (фильтр по `enabled`).
2. Пустой приём (нет items) → редактор запрещает сохранение; на часах защитно пропускается.
3. `takeLog` хранит снимок items → редактирование приёма после приёма не ломает историю.
4. Retry/snooze отменяются, если приём уже принят или отменён (логика по `intakeId`).
5. Удаление/редактирование приёма → `refreshAlarms()` пересоздаёт алarмы.

## Тестирование

- Сборка/превью: `zeus preview --target "Amazfit Balance 2"` из `src`.
- Проверка сценариев: создание лекарств и приёмов в companion → появление на home/plan → алarm → take / undo / cancel / snooze → история на телефоне.

## Замечание (вне рамок задачи, вернуться позже)

Сейчас нет механизма доставки конфигурации (лекарства/приёмы) из companion-настроек (телефон) в хранилище часов (`ShareLocalStorage`) — watch читает только своё локальное хранилище. Это предсуществующий пробел, не связанный с реструктуризацией; в эту задачу не включается.
