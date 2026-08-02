# Адаптивная раскладка экранов (круглая / прямоугольная) — план реализации

> **Для агентных исполнителей:** ОБЯЗАТЕЛЬНЫЙ ПОД-НАВЫК: используйте superpowers:subagent-driven-development (рекомендуется) или superpowers:executing-plans для реализации этого плана по задачам. Шаги используют синтаксис чекбоксов (`- [ ]`) для отслеживания.

**Цель:** Сделать две версии раскладки страниц часов (Home, Plan, Snooze) — для круглого и прямоугольного экрана — с автоматическим переключением по форме экрана и без обрезания контента корпусом.

**Архитектура:** Новый модуль `src/utils/screen-layout.js` определяет форму экрана через `@zos/device` (`getDeviceInfo().screenShape`) и отдаёт границы контентной области (круглая: вписанный квадрат 70…410; прямоугольная: 20…460). Общий хелпер `renderTimeHeader` рисует время текстом и линию-разделитель отдельным виджетом `FILL_RECT` (вместо текстовых тире). Три страницы переписываются на общие границы; чекбокс/контрол переносится слева к первой строке лекарств. В `app.json` добавляется платформа `{ "st": "s" }` и разрешение `data:os.device.info`.

**Технологии:** Zepp OS (API 4.2), императивные виджеты `@zos/ui`, `@zos/device`, Node test runner (`node --test`) со стабами `@zos/*`.

**Правило размеров:** шрифты — только `sysText()`, размеры/отступы — `S = getUiScale()`. Границы контента (безопасная зона) — физические, НЕ масштабируются (`isRoundScreen` и `getContentBounds` не кэшируют результат — иначе нельзя переключать форму в тестах).

---

### Задача 1: Тестовая инфраструктура — стабы `@zos/device` и UI

**Файлы:**
- Создать: `src/test/helpers/stubs/zos-device.mjs`
- Изменить: `src/test/helpers/zos-loader.mjs`
- Изменить: `src/test/helpers/stubs/zos-ui.mjs`

- [ ] **Шаг 1: Добавить стаб `@zos/device`**

Создать файл `src/test/helpers/stubs/zos-device.mjs`:

```js
let shape = 'round'

export const SCREEN_SHAPE_SQUARE = 1
export const SCREEN_SHAPE_ROUND = 2

export function getDeviceInfo() {
  return {
    width: 480,
    height: 480,
    screenShape: shape === 'round' ? SCREEN_SHAPE_ROUND : SCREEN_SHAPE_SQUARE,
  }
}

export function __setShape(next) {
  shape = next === 'square' ? 'square' : 'round'
}
```

- [ ] **Шаг 2: Зарегистрировать `@zos/device` в загрузчике**

В `src/test/helpers/zos-loader.mjs` добавить строку в карту `ZOS_STUBS`:

```js
  '@zos/device': './stubs/zos-device.mjs',
```

Итоговая карта:

```js
const ZOS_STUBS = {
  '@zos/ui': './stubs/zos-ui.mjs',
  '@zos/router': './stubs/zos-router.mjs',
  '@zos/utils': './stubs/zos-utils.mjs',
  '@zos/storage': './stubs/zos-storage.mjs',
  '@zos/alarm': './stubs/zos-alarm.mjs',
  '@zos/device': './stubs/zos-device.mjs',
}
```

- [ ] **Шаг 3: Расширить стаб `@zos/ui`**

В `src/test/helpers/stubs/zos-ui.mjs`:
1. добавить константу виджета в объект `widget`:

```js
export const widget = {
  TEXT: 1,
  GROUP: 2,
  BUTTON: 3,
  FILL_RECT: 4,
}
```

2. добавить функцию измерения текста после `getSysFontSize`:

```js
export function getTextLayout(text, options) {
  const size = options && options.text_size ? options.text_size : 16
  return { width: Math.ceil(text.length * size * 0.6), height: size, rows: 1, result: 0, text }
}
```

- [ ] **Шаг 4: Прогнать существующие тесты — убедиться, что ничего не сломалось**

Run: `npm test`
Expected: все существующие тесты PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add src/test/helpers/stubs/zos-device.mjs src/test/helpers/zos-loader.mjs src/test/helpers/stubs/zos-ui.mjs
git commit -m "test: add @zos/device stub, FILL_RECT and getTextLayout to ui stub"
```

---

### Задача 2: Модуль `screen-layout.js` — форма экрана и границы контента

**Файлы:**
- Создать: `src/utils/screen-layout.js`
- Тест: `src/test/screen-layout.test.js`

- [ ] **Шаг 1: Написать падающий тест**

Создать `src/test/screen-layout.test.js`:

```js
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const device = await import('./helpers/stubs/zos-device.mjs')
const { __reset } = await import('./helpers/stubs/zos-ui.mjs')

let screenLayout

beforeEach(() => {
  __reset()
  device.__setShape('round')
})

test('isRoundScreen: круглая форма -> true', async () => {
  device.__setShape('round')
  screenLayout = await import('../utils/screen-layout.js')
  assert.equal(screenLayout.isRoundScreen(), true)
})

test('isRoundScreen: прямоугольная форма -> false', async () => {
  device.__setShape('square')
  screenLayout = await import('../utils/screen-layout.js')
  assert.equal(screenLayout.isRoundScreen(), false)
})

test('getContentBounds: круглая — вписанный квадрат', async () => {
  device.__setShape('round')
  screenLayout = await import('../utils/screen-layout.js')
  assert.deepEqual(screenLayout.getContentBounds(), {
    left: 70, top: 70, right: 410, bottom: 410, width: 340, height: 340,
  })
})

test('getContentBounds: прямоугольная — вся ширина с полями', async () => {
  device.__setShape('square')
  screenLayout = await import('../utils/screen-layout.js')
  assert.deepEqual(screenLayout.getContentBounds(), {
    left: 20, top: 20, right: 460, bottom: 460, width: 440, height: 440,
  })
})
```

- [ ] **Шаг 2: Прогнать тест — убедиться, что падает**

Run: `node --test test/screen-layout.test.js`
Expected: FAIL — модуль `../utils/screen-layout.js` не найден.

- [ ] **Шаг 3: Реализовать модуль**

Создать `src/utils/screen-layout.js`:

```js
import { getDeviceInfo, SCREEN_SHAPE_ROUND } from '@zos/device'

const ROUND_MARGIN = 70
const SQUARE_MARGIN = 20

export function isRoundScreen() {
  return getDeviceInfo().screenShape === SCREEN_SHAPE_ROUND
}

export function getContentBounds() {
  const m = isRoundScreen() ? ROUND_MARGIN : SQUARE_MARGIN
  return {
    left: m,
    top: m,
    right: 480 - m,
    bottom: 480 - m,
    width: 480 - m * 2,
    height: 480 - m * 2,
  }
}
```

- [ ] **Шаг 4: Прогнать тест — убедиться, что проходит**

Run: `node --test test/screen-layout.test.js`
Expected: PASS (4 теста).

- [ ] **Шаг 5: Коммит**

```bash
git add src/utils/screen-layout.js src/test/screen-layout.test.js
git commit -m "feat: screen shape detection and content bounds"
```

---

### Задача 3: Хелпер `renderTimeHeader` (время + линия-разделитель)

**Файлы:**
- Изменить: `src/utils/screen-layout.js`
- Тест: `src/test/render-time-header.test.js`

- [ ] **Шаг 1: Написать падающий тест**

Создать `src/test/render-time-header.test.js`:

```js
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const { __getRegistry, __reset, widget, createWidget, deleteWidget } = await import('./helpers/stubs/zos-ui.mjs')
const device = await import('./helpers/stubs/zos-device.mjs')
const storage = await import('./helpers/stubs/zos-storage.mjs')

const { createViewManager } = await import('../utils/view-manager.js')
const { renderTimeHeader, getContentBounds } = await import('../utils/screen-layout.js')

function ui() {
  return createViewManager(createWidget, deleteWidget)
}

beforeEach(() => {
  __reset()
  device.__setShape('round')
  storage.__resetStorage()
  new storage.ShareLocalStorage('aibolit-data.json')
})

test('создаёт текст времени и линию FILL_RECT правее текста', () => {
  const b = getContentBounds()
  renderTimeHeader(ui(), { text: '08:00', x: b.left, y: 100, right: b.right, color: 0x4fc3f7, sizeSp: 26, rowH: 44 })

  const time = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === '08:00')
  assert.ok(time, 'время должно быть текстом')

  const line = __getRegistry().find(w => w.type === widget.FILL_RECT)
  assert.ok(line, 'должна быть линия-разделитель FILL_RECT')
  assert.ok(line.props.x >= time.props.x + time.props.w, 'линия начинается после времени')
  assert.ok(line.props.w > 0, 'линия имеет ненулевую ширину')
  assert.ok(line.props.x + line.props.w <= b.right, 'линия не выходит за правый край контента')
})

test('длинное время не создаёт линию за пределами контента', () => {
  const b = getContentBounds()
  renderTimeHeader(ui(), { text: '23:59:59', x: b.left, y: 100, right: b.right, color: 0xffffff, sizeSp: 26, rowH: 44 })
  const line = __getRegistry().find(w => w.type === widget.FILL_RECT)
  if (line) {
    assert.ok(line.props.x + line.props.w <= b.right, 'линия в пределах контента')
  }
})
```

- [ ] **Шаг 2: Прогнать тест — убедиться, что падает**

Run: `node --test test/render-time-header.test.js`
Expected: FAIL — `renderTimeHeader is not a function`.

- [ ] **Шаг 3: Реализовать `renderTimeHeader`**

Дополнить `src/utils/screen-layout.js`:

```js
import { widget, align, text_style, getTextLayout } from '@zos/ui'
import { getDeviceInfo, SCREEN_SHAPE_ROUND } from '@zos/device'
import { sysText, getUiScale } from './ui-scale'

const ROUND_MARGIN = 70
const SQUARE_MARGIN = 20

export function isRoundScreen() {
  return getDeviceInfo().screenShape === SCREEN_SHAPE_ROUND
}

export function getContentBounds() {
  const m = isRoundScreen() ? ROUND_MARGIN : SQUARE_MARGIN
  return {
    left: m,
    top: m,
    right: 480 - m,
    bottom: 480 - m,
    width: 480 - m * 2,
    height: 480 - m * 2,
  }
}

export function renderTimeHeader(ui, { text, x, y, right, color = 0xffffff, sizeSp = 26, rowH = 44, lineColor = 0x2a2a2a }) {
  const S = getUiScale()
  const size = sysText(sizeSp)
  const lineH = Math.max(2, 3 * S)

  let timeW = 0
  try {
    const layout = getTextLayout(text, { text_size: size, text_width: 0, wrapped: 0 })
    timeW = layout && layout.width ? layout.width : 0
  } catch (e) {
    timeW = 0
  }
  if (!timeW) timeW = text.length * size * 0.6

  const gap = 18 * S
  ui.create(widget.TEXT, {
    x: x,
    y: y,
    w: timeW + gap,
    h: rowH,
    color: color,
    text_size: size,
    align_h: align.LEFT,
    align_v: align.CENTER_V,
    text_style: text_style.NONE,
    text: text,
  })

  const lineX = x + timeW + gap
  if (lineX < right - 4) {
    ui.create(widget.FILL_RECT, {
      x: lineX,
      y: y + rowH / 2 - lineH / 2,
      w: right - lineX,
      h: lineH,
      color: lineColor,
    })
  }
}
```

- [ ] **Шаг 4: Прогнать тест — убедиться, что проходит**

Run: `node --test test/render-time-header.test.js`
Expected: PASS (2 теста).

- [ ] **Шаг 5: Коммит**

```bash
git add src/utils/screen-layout.js src/test/render-time-header.test.js
git commit -m "feat: renderTimeHeader helper with FILL_RECT divider line"
```

---

### Задача 4: Переработка страницы Home

**Файлы:**
- Изменить: `src/page/home/index.js`
- Тест: `src/test/home-page-render.test.js`

- [ ] **Шаг 1: Написать падающие тесты**

В конец `src/test/home-page-render.test.js` добавить импорты и тесты.

Добавить в импорты (после строки `const { __getRegistry, __reset, deleteWidget, event } = ...`):

```js
const device = await import('./helpers/stubs/zos-device.mjs')
```

В `beforeEach` добавить:

```js
  device.__setShape('round')
```

Добавить тесты:

```js
test('заголовок времени блока рисуется как текст + линия FILL_RECT', () => {
  const page = instance()
  page.refreshView()

  const time = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === '23:59')
  assert.ok(time, 'время должно быть текстом')

  const line = __getRegistry().find(w => w.type === widget.FILL_RECT)
  assert.ok(line, 'должна быть линия-разделитель FILL_RECT')
  assert.ok(line.props.x >= time.props.x + time.props.w, 'линия начинается после времени')
})

test('чекбокс слева от лекарств и по верхнему краю первой строки', () => {
  const page = instance()
  page.refreshView()

  const check = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === '\u2610')
  assert.ok(check, 'чекбокс должен существовать')
  assert.equal(check.props.x, 70, 'чекбокс на левом краю контента (круглая форма)')

  const med = __getRegistry().find(w => w.type === widget.TEXT && w.props.text.startsWith('Аспирин'))
  assert.ok(med, 'строка лекарства должна существовать')
  assert.equal(check.props.y, med.props.y, 'чекбокс по верхнему краю первой строки лекарств')
})

test('круглая форма: все виджеты в пределах безопасной зоны', () => {
  const page = instance()
  page.refreshView()

  const alive = __getRegistry().filter(w => !w.deleted)
  assert.ok(alive.length > 0)
  for (const w of alive) {
    assert.ok(w.props.x >= 70, 'x >= 70: ' + (w.props.text || w.props.x))
    assert.ok(w.props.x + w.props.w <= 410, 'x + w <= 410: ' + (w.props.text || w.props.x))
  }
})
```

В тестах понадобится `widget` — импортировать: дополнить строку импорта стаба:

```js
const { __getRegistry, __reset, deleteWidget, event, widget } = await import('./helpers/stubs/zos-ui.mjs')
```

- [ ] **Шаг 2: Прогнать тесты — убедиться, что падают**

Run: `node --test test/home-page-render.test.js`
Expected: FAIL — новых тестов (время-как-текст с тире, чекбокс справа и по центру).

- [ ] **Шаг 3: Переписать `renderUpcoming` на новые границы**

Заменить весь метод `renderUpcoming` в `src/page/home/index.js`:

```js
  renderUpcoming(entries) {
    this.ui.clear()
    const S = getUiScale()
    const bounds = getContentBounds()
    const btnH = 48 * S
    const btnY = isRoundScreen() ? bounds.bottom - btnH : 380 * S
    let y = bounds.top

    this.ui.create(widget.TEXT, {
      x: bounds.left,
      y: y,
      w: bounds.width,
      h: 48 * S,
      color: 0xffffff,
      text_size: sysText(32),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'Ближайшие приёмы',
    })
    y += 60 * S

    if (entries.length === 0) {
      this.ui.create(widget.TEXT, {
        x: bounds.left,
        y: y,
        w: bounds.width,
        h: 36 * S,
        color: 0x888888,
        text_size: sysText(26),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: 'Нет предстоящих приёмов',
      })
    }

    const checkColW = 40 * S
    const checkGap = 16 * S

    for (const entry of entries) {
      const items = entry.items || []
      const blockH = (44 + items.length * 40 + 10) * S
      if (y + blockH > btnY - 5) break

      const intake = entry.intake

      renderTimeHeader(this.ui, {
        text: intake.time,
        x: bounds.left,
        y: y,
        right: bounds.right,
        color: 0x4fc3f7,
        sizeSp: 26,
        rowH: 44 * S,
      })
      y += 44 * S

      const medX = bounds.left + checkColW + checkGap
      const medW = bounds.right - medX
      const firstMedY = y

      for (const item of items) {
        this.ui.create(widget.TEXT, {
          x: medX,
          y: y,
          w: medW,
          h: 40 * S,
          color: 0xffffff,
          text_size: sysText(24),
          align_h: align.LEFT,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: item.med.name + ' \u00d7 ' + (item.amount || ''),
        })
        y += 40 * S
      }

      const takeBtn = this.ui.create(widget.TEXT, {
        x: bounds.left,
        y: firstMedY,
        w: checkColW,
        h: 40 * S,
        color: 0x4fc3f7,
        text_size: sysText(36),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: '\u2610',
      })
      takeBtn.addEventListener(event.CLICK_UP, () => {
        this.takeIntake(intake)
      })

      y += 10 * S
    }

    const planBtn = this.ui.create(widget.TEXT, {
      x: bounds.left,
      y: btnY,
      w: bounds.width,
      h: btnH,
      color: 0x888888,
      text_size: sysText(26),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: '[Полный план \u2192]',
    })
    planBtn.addEventListener(event.CLICK_UP, () => {
      routerReplace({ url: 'page/plan/index' })
    })
  },
```

Обновить импорты в `src/page/home/index.js` (заменить строку импорта `ui-scale`):

```js
import { sysText, getUiScale } from '../../utils/ui-scale'
import { isRoundScreen, getContentBounds, renderTimeHeader } from '../../utils/screen-layout'
```

- [ ] **Шаг 4: Прогнать тесты — убедиться, что проходят**

Run: `node --test test/home-page-render.test.js`
Expected: PASS (все тесты, включая новые и старые).

- [ ] **Шаг 5: Коммит**

```bash
git add src/page/home/index.js src/test/home-page-render.test.js
git commit -m "feat: adaptive home layout (round/square) with left-top checkbox"
```

---

### Задача 5: Переработка страницы Plan

**Файлы:**
- Изменить: `src/page/plan/index.js`
- Тест: `src/test/plan-page-render.test.js`

- [ ] **Шаг 1: Написать падающие тесты**

В `src/test/plan-page-render.test.js`:
1. добавить импорт стаба устройства и `widget`:

```js
const { __getRegistry, __reset, event, widget } = await import('./helpers/stubs/zos-ui.mjs')
const device = await import('./helpers/stubs/zos-device.mjs')
```

2. в `beforeEach` добавить:

```js
  device.__setShape('round')
```

3. добавить тесты:

```js
test('время блока — без текстовых тире', () => {
  const page = instance()
  page.refreshView()

  const dashTexts = __getRegistry().filter(
    w => w.type === widget.TEXT && typeof w.props.text === 'string' && w.props.text.includes('\u2500')
  )
  assert.equal(dashTexts.length, 0, 'не должно быть текстовых тире в заголовках времени')
})

test('контрол приёма слева и по верхнему краю первой строки', () => {
  const page = instance()
  page.refreshView()

  const ctrl = __getRegistry().find(w => w.type === widget.TEXT && w.props.text === '\u2610')
  assert.ok(ctrl, 'контрол ☐ должен существовать')
  assert.equal(ctrl.props.x, 70, 'контрол на левом краю контента (круглая форма)')

  const med = __getRegistry().find(w => w.type === widget.TEXT && w.props.text.startsWith('Аспирин'))
  assert.ok(med, 'строка лекарства должна существовать')
  assert.equal(ctrl.props.y, med.props.y, 'контрол по верхнему краю первой строки')
})
```

- [ ] **Шаг 2: Прогнать тесты — убедиться, что падают**

Run: `node --test test/plan-page-render.test.js`
Expected: FAIL — тире в тексте, контрол справа/по центру.

- [ ] **Шаг 3: Переписать `renderPlan` на новые границы**

Заменить весь метод `renderPlan` в `src/page/plan/index.js`:

```js
  renderPlan(entries) {
    this.ui.clear()
    const S = getUiScale()
    const bounds = getContentBounds()
    const btnH = 48 * S
    const btnY = isRoundScreen() ? bounds.bottom - btnH : 380 * S
    let y = bounds.top

    this.ui.create(widget.TEXT, {
      x: bounds.left,
      y: y,
      w: bounds.width,
      h: 48 * S,
      color: 0xffffff,
      text_size: sysText(32),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'План на сегодня',
    })
    y += 60 * S

    if (entries.length === 0) {
      this.ui.create(widget.TEXT, {
        x: bounds.left,
        y: y,
        w: bounds.width,
        h: 36 * S,
        color: 0x888888,
        text_size: sysText(26),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: 'Нет приёмов на сегодня',
      })
    }

    const checkColW = 40 * S
    const checkGap = 16 * S

    for (const entry of entries) {
      const items = entry.items || []
      const statusH = (entry._takenTime ? 32 : 0) + (entry._cancelled ? 32 : 0)
      const blockH = (44 + items.length * 40 + statusH + 15) * S
      if (y + blockH > btnY - 5) break

      const intake = entry.intake
      const textColor = entry._cancelled ? 0x666666 : (entry._taken ? 0x4caf50 : 0xffffff)
      const statusIcon = entry._taken ? ' \u2713' : ''
      const headerText = intake.time + statusIcon

      renderTimeHeader(this.ui, {
        text: headerText,
        x: bounds.left,
        y: y,
        right: bounds.right,
        color: textColor,
        sizeSp: 26,
        rowH: 44 * S,
      })
      y += 44 * S

      const medX = bounds.left + checkColW + checkGap
      const medW = bounds.right - medX
      const firstMedY = y

      for (const item of items) {
        const medColor = entry._cancelled ? 0x555555 : (entry._taken ? 0x888888 : 0xffffff)
        const medDecor = entry._cancelled ? text_style.STRIKETHROUGH : text_style.NONE
        this.ui.create(widget.TEXT, {
          x: medX,
          y: y,
          w: medW,
          h: 40 * S,
          color: medColor,
          text_size: sysText(24),
          align_h: align.LEFT,
          align_v: align.CENTER_V,
          text_style: medDecor,
          text: item.med.name + ' \u00d7 ' + (item.amount || ''),
        })
        y += 40 * S
      }

      if (entry._taken && entry._takenTime) {
        this.ui.create(widget.TEXT, {
          x: medX,
          y: y,
          w: medW,
          h: 32 * S,
          color: 0x666666,
          text_size: sysText(20),
          align_h: align.LEFT,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: 'приняты в ' + entry._takenTime,
        })
        y += 32 * S
      }

      if (entry._cancelled) {
        const restoreBtn = this.ui.create(widget.TEXT, {
          x: medX,
          y: y,
          w: medW,
          h: 32 * S,
          color: 0x4fc3f7,
          text_size: sysText(20),
          align_h: align.LEFT,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: 'вернуть прием',
        })
        restoreBtn.addEventListener(event.CLICK_UP, () => {
          this.restoreIntake(intake)
        })
        y += 32 * S
      }

      if (!entry._cancelled) {
        const symbol = entry._taken ? '\u2713' : '\u2610'
        const color = entry._taken ? 0x4caf50 : 0xffffff
        const ctrl = this.ui.create(widget.TEXT, {
          x: bounds.left,
          y: firstMedY,
          w: checkColW,
          h: 40 * S,
          color: color,
          text_size: sysText(36),
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: symbol,
        })
        ctrl.addEventListener(event.CLICK_UP, () => {
          if (entry._taken) {
            this.undoIntake(intake)
          } else {
            this.takeIntake(intake)
          }
        })
        if (!entry._taken) {
          ctrl.addEventListener(event.CLICK_DOWN, () => {
            this._pressTimer = setTimeout(() => {
              this.cancelIntake(intake)
            }, 1000)
          })
        }
      }

      y += 15 * S
    }

    const backBtn = this.ui.create(widget.TEXT, {
      x: bounds.left,
      y: btnY,
      w: bounds.width,
      h: btnH,
      color: 0x888888,
      text_size: sysText(26),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: '[На главную]',
    })
    backBtn.addEventListener(event.CLICK_UP, () => {
      routerReplace({ url: 'page/home/index' })
    })
  },
```

Обновить импорты в `src/page/plan/index.js` (заменить строку импорта `ui-scale`):

```js
import { sysText, getUiScale } from '../../utils/ui-scale'
import { isRoundScreen, getContentBounds, renderTimeHeader } from '../../utils/screen-layout'
```

- [ ] **Шаг 4: Прогнать тесты — убедиться, что проходят**

Run: `node --test test/plan-page-render.test.js`
Expected: PASS (все тесты).

- [ ] **Шаг 5: Коммит**

```bash
git add src/page/plan/index.js src/test/plan-page-render.test.js
git commit -m "feat: adaptive plan layout with left-top control and drawn divider"
```

---

### Задача 6: Переработка страницы Snooze

**Файлы:**
- Изменить: `src/page/snooze/index.js`
- Тест: `src/test/snooze-layout.test.js`

- [ ] **Шаг 1: Написать падающий тест**

Создать `src/test/snooze-layout.test.js`:

```js
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let pageOpts = null
globalThis.Page = (opts) => { pageOpts = opts }

const { __getRegistry, __reset, widget } = await import('./helpers/stubs/zos-ui.mjs')
const storage = await import('./helpers/stubs/zos-storage.mjs')
const device = await import('./helpers/stubs/zos-device.mjs')

await import('../page/snooze/index.js')

function instance() {
  const obj = Object.create(pageOpts)
  obj.state = {
    intakeId: 'i1',
    intake: { id: 'i1', time: '08:00', items: [{ medicationId: 'm1', amount: '1' }] },
  }
  return obj
}

function seed() {
  storage.__resetStorage()
  new storage.ShareLocalStorage('aibolit-data.json')
  storage.__stores().get('aibolit-data.json').set('medications', [{ id: 'm1', name: 'Аспирин', enabled: true }])
  storage.__stores().get('aibolit-data.json').set('intakes', [{ id: 'i1', time: '08:00', items: [{ medicationId: 'm1', amount: '1' }] }])
}

beforeEach(() => {
  __reset()
  device.__setShape('round')
  seed()
})

function buttonAreas() {
  return __getRegistry()
    .filter(w => w.type === widget.TEXT && w.props.text === '')
    .sort((a, b) => a.props.y - b.props.y || a.props.x - b.props.x)
}

test('сетка 2x2: зазор между столбцами равен зазору между строками', () => {
  const page = instance()
  page.renderSnoozeOptions()

  const btns = buttonAreas()
  assert.equal(btns.length, 4, 'должно быть 4 кнопки')
  const [b00, b01, b10] = btns
  const colGap = b01.props.x - (b00.props.x + b00.props.w)
  const rowGap = b10.props.y - (b00.props.y + b00.props.h)
  assert.ok(colGap > 0, 'горизонтальный зазор положительный')
  assert.equal(colGap, rowGap, 'горизонтальный зазор равен вертикальному')
})

test('круглая форма: кнопки в пределах безопасной зоны', () => {
  const page = instance()
  page.renderSnoozeOptions()

  for (const b of buttonAreas()) {
    assert.ok(b.props.x >= 70, 'x >= 70')
    assert.ok(b.props.x + b.props.w <= 410, 'x + w <= 410')
  }
})
```

- [ ] **Шаг 2: Прогнать тест — убедиться, что падает**

Run: `node --test test/snooze-layout.test.js`
Expected: FAIL — старый макет: разный зазор (col gap ≠ row gap) или выход за границы.

- [ ] **Шаг 3: Переписать `renderSnoozeOptions` на новые границы**

Заменить весь метод `renderSnoozeOptions` в `src/page/snooze/index.js`:

```js
  renderSnoozeOptions() {
    const settings = getSettings()
    const options = settings.snoozeOptions || [30, 45, 60, 90]
    const intake = this.state.intake
    const S = getUiScale()
    const bounds = getContentBounds()
    const centerX = 480 / 2
    let y = bounds.top

    const medications = getMedications()
    const medMap = {}
    for (const med of medications) medMap[med.id] = med

    const itemsText = (intake && intake.items ? intake.items : [])
      .map(item => {
        const med = medMap[item.medicationId]
        return med ? med.name + ' \u00d7 ' + (item.amount || '') : null
      })
      .filter(Boolean)
      .join(', ')

    createWidget(widget.TEXT, {
      x: bounds.left,
      y: y,
      w: bounds.width,
      h: 40 * S,
      color: 0xffffff,
      text_size: sysText(28),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: intake ? (intake.label || intake.time) : '',
    })
    y += 48 * S

    if (itemsText) {
      createWidget(widget.TEXT, {
        x: bounds.left,
        y: y,
        w: bounds.width,
        h: 28 * S,
        color: 0x888888,
        text_size: sysText(22),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: itemsText,
      })
      y += 30 * S
    }

    createWidget(widget.TEXT, {
      x: bounds.left,
      y: y,
      w: bounds.width,
      h: 28 * S,
      color: 0x888888,
      text_size: sysText(22),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'Отложить на:',
    })
    y += 40 * S

    const gap = 20 * S
    const rows = Math.ceil(options.length / 2)
    const btnH = Math.min(72 * S, (bounds.bottom - y - (rows - 1) * gap) / rows)
    const btnW = (bounds.width - gap) / 2
    const gridX = centerX - (btnW * 2 + gap) / 2
    let col = 0
    let row = 0

    for (const minutes of options) {
      const bx = gridX + col * (btnW + gap)
      const by = y + row * (btnH + gap)

      createWidget(widget.TEXT, {
        x: bx,
        y: by + Math.floor(btnH / 2) - 18 * S,
        w: btnW,
        h: 40 * S,
        color: 0x4fc3f7,
        text_size: sysText(40),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: String(minutes),
      })

      createWidget(widget.TEXT, {
        x: bx,
        y: by + Math.floor(btnH / 2) + 14 * S,
        w: btnW,
        h: 24 * S,
        color: 0x888888,
        text_size: sysText(20),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: 'мин',
      })

      const btnArea = createWidget(widget.TEXT, {
        x: bx,
        y: by,
        w: btnW,
        h: btnH,
        color: 0xFFFFFF,
        text_size: 1,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: '',
      })
      btnArea.addEventListener(event.CLICK_UP, () => {
        this.confirmSnooze(minutes)
      })

      col++
      if (col >= 2) {
        col = 0
        row++
      }
    }
  },
```

Обновить импорты в `src/page/snooze/index.js`:

```js
import { sysText, getUiScale } from '../../utils/ui-scale'
import { getContentBounds } from '../../utils/screen-layout'
```

- [ ] **Шаг 4: Прогнать тест — убедиться, что проходит**

Run: `node --test test/snooze-layout.test.js`
Expected: PASS (2 теста).

- [ ] **Шаг 5: Коммит**

```bash
git add src/page/snooze/index.js src/test/snooze-layout.test.js
git commit -m "feat: adaptive snooze layout with equal column/row gaps"
```

---

### Задача 7: `app.json` — платформы, разрешение, версия

**Файлы:**
- Изменить: `src/app.json`

- [ ] **Шаг 1: Добавить платформу квадратного экрана и разрешение**

В `src/app.json`:
1. заменить `platforms`:

```json
      "platforms": [
        {
          "st": "r"
        },
        {
          "st": "s"
        }
      ],
```

2. добавить разрешение в `permissions` (после `"device:os.bg_service"`):

```json
    "device:os.bg_service",
    "data:os.device.info"
```

3. поднять версию:

```json
    "version": {
      "code": 2,
      "name": "1.1.0"
    },
```

- [ ] **Шаг 2: Проверить корректность JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('app.json','utf8')); console.log('JSON OK')"`
Expected: `JSON OK`.

- [ ] **Шаг 3: Полный прогон тестов**

Run: `npm test`
Expected: все тесты PASS.

- [ ] **Шаг 4: Коммит**

```bash
git add src/app.json
git commit -m "build: support square screens, add device info permission, bump 1.1.0"
```

---

## Саморевизия плана

- **Покрытие спеки:** форма экрана (задачи 1–2), безопасная зона (задача 2), время+линия (задача 3), чекбокс слева сверху Home/Plan (задачи 4–5), snooze с равными зазорами (задача 6), платформа `s` и разрешение (задача 7).
- **Плейсхолдеры:** отсутствуют — весь код приведён полностью.
- **Согласованность имён:** `renderTimeHeader(ui, { text, x, y, right, color, sizeSp, rowH, lineColor })` — сигнатура одинакова во всех задачах; `getContentBounds()` возвращает `{ left, top, right, bottom, width, height }` — одинаково в задачах 2–6; `isRoundScreen()` без кэша.
