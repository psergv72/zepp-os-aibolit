# Дизайн: устойчивая сортировка приёмов по времени

Дата: 2026-08-08

## Проблема

На часах экраны «Сегодня» (`src/page/home/index.js:75`) и «План на сегодня»
(`src/page/plan/index.js:76`) сортируют приёмы по времени через
`localeCompare`. Это лексикографическое сравнение строк. Если время хранится
как `8:00` (без ведущего нуля), то `"10:00" < "8:00"` лексикографически, и
порядок приёмов отображается неверно.

На телефоне сравнение времени числовое (`timeMinutes`,
`src/setting/index.js:84`), поэтому там порядок корректен.

## Решение

### Часть 1 — общий хелпер на часах

В `src/utils/intake-logic.js` добавить экспортируемую функцию:

```js
export function timeToMinutes(time) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time || '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}
```

Аналог телефонного `timeMinutes` (`src/setting/index.js:84`). Парсит
`HH:MM` или `H:MM`, при невалидной строке возвращает `0`.

В обеих страницах заменить сортировку:

```js
.sort((a, b) => timeToMinutes(a.intake.time) - timeToMinutes(b.intake.time))
```

- `src/page/home/index.js:75`
- `src/page/plan/index.js:76`

Файлы:
- `src/utils/intake-logic.js`
- `src/page/home/index.js`
- `src/page/plan/index.js`

### Часть 2 — нормализация времени на телефоне

В `src/setting/index.js` при сохранении приёма (кнопка «Сохранить»,
~строка 437) нормализовать `draft.time` к формату `HH:MM` — добавить
ведущий ноль к часу и обрезать до `HH:MM`:

```js
function normalizeTime(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((str || '').trim())
  return m
    ? String(Number(m[1])).padStart(2, '0') + ':' + m[2]
    : (str || '').trim()
}
```

Валидация `if (!draft.time.trim() ...)` остаётся; нормализованное значение
используется для сохранения. Это чинит новые и редактируемые записи в корне.

Файлы:
- `src/setting/index.js`

## Тесты

- `src/test/intake-logic.test.js` — тест на `timeToMinutes`: `'08:00' -> 480`,
  `'8:00' -> 480`, `'23:59' -> 1439`, невалидная строка -> `0`.
- `src/test/home-page-render.test.js` — тест: приёмы со временем `8:00` и
  `10:00` отображаются в порядке 8:00 раньше 10:00.
- `src/test/plan-page-render.test.js` — тот же тест для план-страницы.
- `src/test/settings-render.test.js` — тест: сохранение приёма со временем
  `8:00` сохраняет `08:00`.

## Границы

Правки только в перечисленных файлах. Без рефакторинга соседнего кода.
