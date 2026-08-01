# Дизайн: Unit-тесты и хелпер-модуль intake-logic

Дата: 2026-08-01
Ветка: `feature/intake-groups`

## Цель

Добавить unit-тесты для логики приложения «Айболит» (ZeppOS) и устранить дублирование чистой логики путём выделения SDK-независимого модуля-хелперов. Подход — «Чистые хелперы + node:test», выбран в brainstorm.

## Настройка тест-раннера

### `src/package.json`

- Добавить `"type": "module"` — проверено эмпирически: сборка `zeus build` не ломается; `node:test` корректно импортирует ESM-исходники (`.js` с `export`). ВАЖНО: писать файл без BOM (PowerShell `Set-Content -Encoding UTF8` добавляет BOM и ломает JSON — использовать инструмент Write или явный UTF8 без BOM).
- Добавить скрипт: `"test": "node --test test/"`.

### Тесты

- Расположение: `src/test/*.test.js` (ESM, `node:test` + `node:assert/strict`).
- Файлы `src/test/` не входят в бандл zeus (сборка бандлит только точки входа: app.js, страницы, app-service, app-side).
- Запуск: `node --test test/` из `src` (npm.ps1 заблокирован политикой выполнения; при необходимости `npm.cmd test`).

## Хелпер-модуль `src/utils/intake-logic.js`

Чистые функции, без импортов `@zos/*`, все данные передаются параметрами:

```
getWeekDayBit(dayOfWeek)                       → 1|2|4|8|16|32|64|0
getWeekDaysBitmask(weekDays)                   → битовая маска; пусто/null → 127
isIntakeOnDay(intake, dayOfWeek)               → bool (пустой weekDays = каждый день)
getEnabledMedItems(intake, medications)        → [{medicationId, amount}] где med существует и enabled
getIntakeEntries(intakes, medications)         → [{intake, items:[{med, amount}]}] без пустых
isIntakeTakenToday(intakeId, date, takeLogs)   → bool (есть takeLog status 'taken')
isIntakeCancelledToday(intakeId, date, cancellations) → bool
getIntakeStatus(intakeId, date, takeLogs, cancellations) → 'taken'|'cancelled'|'pending'
getTakenTime(intakeId, date, takeLogs)         → takenTime|null
buildItemsSummary(items, medications)          → "Парацетамол × 2 таблетки, Аспирин × 1"
```

Семантика:
- `getIntakeStatus`: если есть taken-лог по intakeId+date → `'taken'` (приоритет); иначе если есть cancellation → `'cancelled'`; иначе `'pending'`.
- `buildItemsSummary`: для каждого item `med.name + ' × ' + (item.amount || '')`, пропуская лекарства, которых нет или они `enabled=false`; join через `', '`; при пустом результате — `''`.
- `getWeekDaysBitmask`: пустой/`null` `weekDays` → 127 (каждый день).
- `getEnabledMedItems`/`getIntakeEntries`: лекарство считается активным, если существует в `medications` и `med.enabled === true`.

## Рефакторинг потребителей

### `src/utils/schedule.js`
- Удалить локальные `getWeekDayBit`, `getWeekDaysBitmask`, `getEnabledItems`.
- Импортировать `getWeekDayBit`, `getWeekDaysBitmask`, `getEnabledMedItems` из `./intake-logic.js`.
- `refreshAlarms`: пропуск приёма, если `getEnabledMedItems(intake, getMedications()).length === 0`.
- Если какие-либо потребители импортируют `getWeekDayBit`/`getWeekDaysBitmask` из `schedule.js` — добавить re-export. (Проверить grep; вероятно, потребителей нет.)

### `src/app-service/reminder.js`
- Удалить локальный `buildContent`.
- Импортировать `buildItemsSummary` из `../utils/intake-logic.js`.
- `const content = buildItemsSummary(intake.items || [], getMedications()) || 'Примите лекарство'`.

### `src/page/home/index.js`
- В `refreshView` заменить ручное построение entries на `getIntakeEntries(intakes, medications)`, далее фильтры: время ≥ текущего; `isIntakeOnDay`; `!isIntakeTakenToday`; `!isIntakeCancelledToday`; сортировка по времени. Карта `enabledMedMap` удаляется.

### `src/page/plan/index.js`
- В `refreshView` entries через `getIntakeEntries(intakes, medications)` + `isIntakeOnDay` + сортировка.
- Статусы: `getIntakeStatus(...)` → `_taken`/`_cancelled`; `_takenTime` через `getTakenTime(...)`.

## Тест-кейсы (`src/test/intake-logic.test.js`)

1. `getWeekDayBit` — корректные дни (1→1, 3→4, 7→64); неизвестный день → 0.
2. `getWeekDaysBitmask` — `[]`→127; `null`→127; `[1]`→1; `[1,3,5]`→21.
3. `isIntakeOnDay` — `weekDays: null` → true для любого дня; `[1,3,5]` + день 3 → true; день 4 → false.
4. `getEnabledMedItems` — отсекает отключённые и отсутствующие лекарства; сохраняет medicationId+amount.
5. `getIntakeEntries` — только enabled-med; приём без них отбрасывается; форма `{ intake, items: [{med, amount}] }`.
6. `isIntakeTakenToday` — taken-лог по intakeId+date → true; snoozed → false; другой intake/дата → false.
7. `isIntakeCancelledToday` — по паре intakeId+date → true/false.
8. `getIntakeStatus` — taken приоритетнее cancelled; иначе cancelled; иначе pending.
9. `getTakenTime` — takenTime taken-лога или null.
10. `buildItemsSummary` — «name × amount, …»; пропуск disabled/удалённых; пусто → ''.

## Верификация

- `node --test test/` из `src` — все тесты pass.
- `zeus build -t "Amazfit Balance 2"` из `src` — сборка успешна (после добавления `"type": "module"`).
- Smoke: watch-потребители после рефакторинга собираются и используют корректные имена хелперов.
