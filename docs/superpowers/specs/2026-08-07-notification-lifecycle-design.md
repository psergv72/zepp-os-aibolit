# Дизайн: жизненный цикл уведомлений о приёме лекарств

## Обзор

Уведомления о приёме лекарств в Aibolit нельзя просто удалить. Каждое
уведомление обязано завершиться одним из трёх исходов: **перенос** на новое
время, статус **«Принято»** или статус **«Отменено»**. Если пользователь никак
не реагирует на уведомление, оно автоматически переносится на новое время и
выдается снова. В центре уведомлений одновременно висит не более одного
уведомления приложения: при выдаче нового уведомления старое необработанное
удаляется, а его приём помечается как **«Пропущено»**.

## Терминология

- **intake** — слот приёма лекарств на день (время, лекарства, дни недели).
- **pending-уведомление** — единственное активное уведомление приложения
  в центре уведомлений Zepp OS. Хранится как `{ intakeId, date }`.
- **Резолв приёма** — переход intake из состояния `pending` в терминальное:
  `taken`, `cancelled` или `skipped`.

## Статусы приёма на день

| Статус | Значение | Терминальный |
| ------ | -------- | ------------ |
| `pending` | Не обработан, напоминание активно | нет |
| `taken` | «Принято» | да |
| `cancelled` | «Отменено» | да |
| `skipped` | «Пропущено» (лекарство так и не принято) | да |

Приоритет определения статуса: `taken` > `cancelled` > `skipped` > `pending`.
Константа `INTAKE_STATUS.SKIPPED` уже объявлена в `src/utils/constants.js`
и начинает реально использоваться.

## Правила поведения

1. **Одно уведомление.** Приложение держит в центре уведомлений максимум одно
   уведомление. Перед выдачей нового все уведомления приложения удаляются через
   `getAllNotifications()` + `cancel(ids)`.
2. **Уведомление нельзя удалить обычным способом.** Свайп/закрытие уведомления
   в системном центре не резолвит приём: intake остаётся `pending`, и
   автоперенос продолжает выдавать уведомление, пока приём не будет
   принят/отменён/пропущен.
3. **Исходы уведомления:**
   - **Принято** — тап «Принял» → страница `take`, intake = `taken`,
     уведомление закрывается.
   - **Отменено** — тап «Отменить» → страница `cancel` с подтверждением
     «Да/Нет» → intake = `cancelled`, уведомление закрывается.
   - **Перенос** — тап «Отложить» → страница `snooze`, выбранная задержка
     (30/45/60/90 мин) → snooze-будильник; по его срабатыванию выдаётся новое
     уведомление.
   - **Автоперенос** — пользователь не отреагировал (включая свайп) → через
     `retryInterval` минут выдаётся новое уведомление. Повторяется до конца дня
     или до резолва.
4. **Глобальное правило «старое удаляется, новое выдаётся» с пометкой
   «Пропущено»:** перед выдачей уведомления, если pending-уведомление
   принадлежит **другому** intake (за тот же день), этот старый intake
   помечается `skipped` (запись в takeLogs + синхронизация на телефон), его
   уведомление удаляется, выдаётся новое. Если pending принадлежит **тому же**
   intake (автоперенос/отложить) — старое просто заменяется, `skipped` не
   ставится.
5. **Страница плана:** статус «Пропущено» отображается отдельной отметкой
   (символ `☒` U+2612 + текст «пропущено») и остаётся тапабельным — по тапу
   приём помечается «Принято» (перекрывает `skipped`).

## Архитектура

### Новый модуль `src/utils/notification-lifecycle.js`

Единственный владелец жизненного цикла уведомлений. Экспорты:

- `getPendingIntake()` — возвращает `{ intakeId, date }` текущего
  pending-уведомления из storage или `null`.
- `issueNotification(intakeId)` — центральная функция:
  1. intake найден и не `taken`/`cancelled`/`skipped` за сегодня, иначе no-op.
  2. Если pending есть, `pending.date === today` и `pending.intakeId !== intakeId`
     — `markSkipped(pending.intakeId, today)`.
  3. `cancelAllNotifications()`.
  4. `notify()` с кнопками «Принял» (`page/take`), «Отложить»
     (`page/snooze`), «Отменить» (`page/cancel`).
  5. `setPending(intakeId, today)`.
  6. `scheduleRetry(intakeId)`.
- `clearPendingForIntake(intakeId)` — если pending принадлежит этому intake:
  `cancelAllNotifications()` + сброс pending. Вызывается при резолве приёма.
- `markSkipped(intakeId, date)` — добавить takeLog `{ status: 'skipped' }`
  и `sendTakeLogToPhone`.
- `cancelAllNotifications()` — `getAllNotifications()` → `cancel(ids)`, в
  try/catch.

Вспомогательная приватная логика:

- `isIntakeResolvedToday(intakeId, date)` — `taken`/`cancelled`/`skipped`.
- `scheduleRetry(intakeId)` — создаёт ретрай-будильник на `retryInterval` минут
  с параметром `date` (день, для которого актуален приём). Если время
  следующего ретрая попадает на новый день — не планировать.

### Изменения в существующих файлах

- **`src/app-service/reminder.js`** — становится тонким обработчиком:
  - `REMINDER`/`RETRY`/`SNOOZE` → `issueNotification(intakeId)`.
  - `SYNC` — без изменений (applyConfig/refreshAlarms/retrySync).
  - Прямая логика `notify()` переносится в `notification-lifecycle`.
- **`src/utils/constants.js`** — `DEFAULT_SETTINGS.retryInterval: 60 → 5`;
  новый ключ storage `PENDING_NOTIFICATION`.
- **`src/utils/storage.js`** — хелперы `getPendingNotification()` /
  `setPendingNotification()` / `clearPendingNotification()`.
- **`src/utils/intake-logic.js`** — `getIntakeStatus` учитывает `skipped`;
  `isIntakeSkippedToday(intakeId, date, takeLogs)`.
- **`src/page/take/index.js`** — после `taken` вызывает
  `clearPendingForIntake(intakeId)`.
- **`src/page/snooze/index.js`** — после создания snooze-будильника вызывает
  `clearPendingForIntake(intakeId)`; запись `snoozed` сохраняется.
- **`src/page/plan/index.js`** — `takeIntake`/`cancelIntake` вызывают
  `clearPendingForIntake`; отображение `skipped`: отметка `☒` + текст
  «пропущено», тап переводит в «Принято».
- **`src/page/home/index.js`** — исключает `skipped` из списка предстоящих.

### Новый файл `src/page/cancel/index.js`

Страница подтверждения отмены (по образцу `page/snooze`): заголовок с label/time
intake, список лекарств, вопрос «Отменить приём?», кнопки «Да»/«Нет».

- **«Да»** → `addCancellation(intakeId, today)` + `sendCancellationToPhone` +
  `clearPendingForIntake(intakeId)` + `routerExit`.
- **«Нет»** → `routerExit`. Приём остаётся `pending` — автоперенос перевыдаст
  уведомление (функциональный запрет удаления).

Размеры текста/элементов — только через `sysText()`/`uiSize()` из
`src/utils/ui-scale.js` (правило минимального шрифта, см. AGENTS.md).

## Потоки данных

1. **REMINDER** (штатное время) → `issueNotification` → гарды → при чужом
   pending `markSkipped(old)` → `cancelAllNotifications` → `notify` →
   `setPending` → `scheduleRetry`.
2. **RETRY** (автоперенос) → `issueNotification`: pending тот же intake →
   замена без skip → новый ретрай (цикл до конца дня).
3. **SNOOZE** (пользователь отложил) → по срабатыванию `issueNotification` +
   `scheduleRetry`.
4. **Принял** → `take`: `taken` + sync + `clearPendingForIntake`.
5. **Отменить** → `cancel`: «Да» → `cancelled` + sync + `clearPendingForIntake`;
   «Нет» → exit без резолва.
6. **Отложить** → `snooze`: задержка → snooze-будильник + запись `snoozed` +
   sync + `clearPendingForIntake`.
7. **План-страница**: тап по `skipped` → «принято»; `taken`/`cancel`/`undo`
   вызывают `clearPendingForIntake`.
8. **Домашняя страница**: исключает `taken`/`cancelled`/`skipped`.

## Краевые случаи

- **Stale pending (вчера):** перед выдачей, если `pending.date !== today`,
  просто `cancelAll` + сброс; `skipped` не ставится.
- **Intake удалён из конфига:** `issueNotification` не находит intake → no-op;
  stale pending на удалённый intake → сброс без skip.
- **`notify()` вернул 0 (сбой):** лог; pending фиксируется, ретрай планируется —
  следующий цикл восстановит уведомление.
- **Пересечение полночи:** `RETRY`/`SNOOZE`-будильник несёт `date` создания;
  при срабатывании, если `date !== today` → no-op.
- **Skipped → taken:** запись `taken` перекрывает; приоритет статусов
  `taken > cancelled > skipped > pending`; на телефоне существующая логика
  конфликтов (замена по `intakeId` + `date`) уже оставляет последнюю запись.
- **Undo taken после skipped:** после undo в takeLogs остаётся запись `skipped`
  → статус снова `skipped`.
- **Несколько приёмов в одно время:** первый становится pending, второй
  помечает первый `skipped` (принятое глобальное правило).

## Тестирование

- `src/test/reminder-service.test.js`:
  - ретрай заменяет уведомление того же intake без `skipped`;
  - чужой intake → в takeLogs появляется запись `skipped`;
  - guard-ы `taken`/`cancelled`/`skipped` → уведомление не выдаётся;
  - `cancelAll` вызывается перед `notify`;
  - ретрай не планируется после конца дня;
  - no-op при пересечении полуночи.
- Новый `src/test/notification-lifecycle.test.js`:
  - `issueNotification` (гарды, замена, чужой pending → skip),
  - `clearPendingForIntake`,
  - `markSkipped`,
  - stale pending.
- `src/test/intake-logic.test.js`: `getIntakeStatus` с `skipped`, приоритет.
- `src/test/take-page.test.js`, `src/test/snooze-page.test.js`,
  `src/test/plan-page-render.test.js`, новый `cancel-page` тест:
  `clearPendingForIntake`, отметка `☒` + «пропущено», тап → «принято».
- `src/test/constants`-тест: `retryInterval` по умолчанию = 5.
