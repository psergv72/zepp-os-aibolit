# Нативный дизайн настроек — план реализации

> **Для агентных исполнителей:** ОБЯЗАТЕЛЬНЫЙ ПОД-НАВЫК: superpowers:subagent-driven-development (рекомендуется) или superpowers:executing-plans для реализации по шагам. Шаги используют чекбоксы (`- [ ]`).

**Цель:** Перестроить все экраны телефонных настроек на нативные компоненты Zepp (`Section`, `TextInput`, `Toggle`, `Select`, `Button`) со стандартным видом.

**Архитектура:** Меняется только `src/setting/index.js` — все 7 методов `render*` переводятся со «вручную стилизованных» строк на секции `Section` с нативными компонентами. Стили сжимаются до минимума (отступы). Логика, хранилище и синхронизация не трогаются.

**Технологии:** Zepp OS AppSettingsPage (JS, CSS-стили), node:test для тестов.

---

### Task 1: Добавить тесты на структуру секций

**Files:**
- Modify: `src/test/settings-render.test.js`

- [ ] **Step 1: Добавить хелпер и два новых теста**

В конец `src/test/settings-render.test.js` (после последнего теста) добавить:

```js
function findBySection(tree, title) {
  let found = null
  walk(tree, (n) => {
    if (!found && n.type === 'Section' && n.props && n.props.title === title) found = n
  })
  return found
}

test('страница Настройки группирует параметры в секции', () => {
  const storage = createStorage()
  setup(storage)
  options.navigateTo('settings')
  const tree = options.build({ settingsStorage: storage })
  assert.ok(findBySection(tree, 'Напоминания'), 'должна быть секция Напоминания')
  assert.ok(findBySection(tree, 'Отображение'), 'должна быть секция Отображение')
})

test('список лекарств использует секции', () => {
  const storage = createStorage()
  storage.setItem('medications', JSON.stringify([{ id: 'm1', name: 'Аспирин', dosage: '100 мг', comments: '', enabled: true }]))
  setup(storage)
  const tree = options.build({ settingsStorage: storage })
  assert.ok(findBySection(tree, 'Мои лекарства'), 'должна быть секция Мои лекарства')
  assert.ok(findBySection(tree, 'Управление'), 'должна быть секция Управление')
})
```

- [ ] **Step 2: Запустить тесты и убедиться, что новые падают**

Run: `npm test` (в каталоге `src/`)
Expected: 2 новых теста FAIL («должна быть секция ...»), остальные 13 PASS.

- [ ] **Step 3: Закоммитить тесты**

```bash
git add test/settings-render.test.js
git commit -m "test: проверки секций в настройках (TDD)"
```

---

### Task 2: Перестроить страницу «Настройки»

**Files:**
- Modify: `src/setting/index.js` (объект `S` — добавить `section`; метод `renderSettingsPage`)

- [ ] **Step 1: Добавить стиль секции в `S`**

В объекте `S` (строки 19–28) после `title` добавить `section`:

```js
const S = {
  page: { padding: '12px 20px' },
  title: { fontSize: '18px', marginBottom: '8px' },
  section: { marginBottom: '14px' },
  field: { marginBottom: '12px' },
  row: { padding: '10px 0', borderBottom: '1px solid #eaeaea' },
  rowTitle: { fontSize: '15px' },
  rowSub: { fontSize: '12px', color: '#888' },
  hint: { fontSize: '13px', color: '#888', marginTop: '10px' },
  btn: { marginTop: '10px' },
}
```

(Остальные ключи пока оставляем — остальные страницы ещё не перестроены.)

- [ ] **Step 2: Переписать `renderSettingsPage`**

Заменить тело `renderSettingsPage()` (строки 467–503) на:

```js
  renderSettingsPage() {
    const draft = this.state.settingsDraft

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, ['Настройки']),
      Section({ title: 'Напоминания', style: S.section }, [
        TextInput({ label: 'Интервал повтора (мин)', value: String(draft.retryInterval), onChange: v => { draft.retryInterval = parseInt(v, 10) || 60; this.forceRender() } }),
        TextInput({ label: 'Интервал синхронизации (мин)', value: String(draft.syncInterval), onChange: v => { draft.syncInterval = parseInt(v, 10) || 60; this.forceRender() } }),
        TextInput({
          label: 'Варианты отложки (мин, через запятую)',
          value: draft.snoozeOptions.join(', '),
          onChange: v => { draft.snoozeOptions = v.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)); this.forceRender() },
        }),
      ]),
      Section({ title: 'Отображение', style: S.section }, [
        TextInput({
          label: 'Минимальный размер шрифта (16-40)',
          value: String(draft.minFontSize || 16),
          onChange: v => { draft.minFontSize = Math.max(16, parseInt(v, 10) || 16); this.forceRender() },
        }),
      ]),
      Button({
        label: 'Сохранить',
        color: 'primary',
        style: S.btn,
        onClick: () => {
          this.setAppSettings(draft)
          this.navigateTo('list')
        },
      }),
      Button({ label: 'Назад', color: 'default', style: S.btn, onClick: () => this.navigateTo('list') }),
    ])
  },
```

- [ ] **Step 3: Запустить тесты**

Run: `npm test` (в каталоге `src/`)
Expected: 14 PASS, 1 FAIL. Новый тест «страница Настройки группирует параметры в секции» проходит; тест «список лекарств использует секции» пока падает (страница перестроится в Task 3); старые тесты по «Интервал повтора (мин)» и «Минимальный размер шрифта (16-40)» проходят.

- [ ] **Step 4: Закоммитить**

```bash
git add setting/index.js
git commit -m "style: нативные секции на странице Настройки"
```

---

### Task 3: Перестроить список лекарств

**Files:**
- Modify: `src/setting/index.js` (метод `renderMedicationList`)

- [ ] **Step 1: Переписать `renderMedicationList`**

Заменить тело `renderMedicationList()` (строки 150–180) на:

```js
  renderMedicationList() {
    const medications = this.getMedications()
    const intakes = this.getIntakes()

    const rows = []
    for (const med of medications) {
      const intakeCount = intakes.filter(x => (x.items || []).some(item => item.medicationId === med.id)).length
      const subText = intakeCount > 0 ? 'в ' + intakeCount + ' приёмах' : ''
      rows.push(
        View(
          { style: S.row, onClick: () => this.navigateTo('edit', { medication: med }) },
          [
            Text({ bold: true }, [med.name + ' (' + med.dosage + ')' + (!med.enabled ? ' [OFF]' : '')]),
            subText ? Text({ style: S.rowSub }, [subText]) : null,
          ],
        ),
      )
    }

    const navRows = ['Приёмы', 'История', 'Настройки'].map(label => {
      const page = label === 'Приёмы' ? 'intakes' : (label === 'История' ? 'history' : 'settings')
      return View(
        { style: S.row, onClick: () => this.navigateTo(page) },
        [Text({ bold: true }, [label])],
      )
    })

    const listChildren = rows.length ? rows : [Text({ style: S.hint }, ['Нет лекарств. Добавьте первое.'])]

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, ['Лекарства']),
      Section({ title: 'Мои лекарства', style: S.section }, listChildren),
      Button({ label: '+ Добавить лекарство', color: 'primary', style: S.btn, onClick: () => this.navigateTo('edit', { medication: null }) }),
      Section({ title: 'Управление', style: S.section }, navRows),
    ])
  },
```

- [ ] **Step 2: Запустить тесты**

Run: `npm test` (в каталоге `src/`)
Expected: все 15 тестов PASS (новый «список лекарств использует секции» проходит).

- [ ] **Step 3: Закоммитить**

```bash
git add setting/index.js
git commit -m "style: нативные секции в списке лекарств"
```

---

### Task 4: Перестроить остальные страницы

**Files:**
- Modify: `src/setting/index.js` (объект `S`; методы `renderMedicationEdit`, `renderIntakeList`, `renderIntakeEdit`, `renderItemEdit`, `renderHistory`)

- [ ] **Step 1: Упростить объект `S`**

Заменить объект `S` (строки 19–28) на:

```js
const S = {
  page: { padding: '12px 20px' },
  title: { marginBottom: '8px' },
  section: { marginBottom: '14px' },
  row: { padding: '10px 0' },
  rowSub: { color: '#888' },
  hint: { color: '#888' },
  btn: { marginTop: '10px' },
}
```

(Убраны `fontSize` у заголовка, `field`, `rowTitle`, мелкие шрифты и `borderBottom`.)

- [ ] **Step 2: Переписать `renderMedicationEdit`**

Заменить тело `renderMedicationEdit()` (строки 184–214) на:

```js
  renderMedicationEdit() {
    const draft = this.state.editDraft
    const isNew = !draft.id

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, [isNew ? 'Добавить лекарство' : 'Редактировать лекарство']),
      Section({ title: 'Основное', style: S.section }, [
        TextInput({ label: 'Название', placeholder: 'Название', value: draft.name, onChange: v => { draft.name = v; this.forceRender() } }),
        TextInput({ label: 'Дозировка', placeholder: 'Дозировка', value: draft.dosage, onChange: v => { draft.dosage = v; this.forceRender() } }),
        TextInput({ label: 'Комментарии', placeholder: 'Комментарии', value: draft.comments, onChange: v => { draft.comments = v; this.forceRender() } }),
        Toggle({ label: 'Активно', value: draft.enabled, onChange: v => { draft.enabled = v; this.forceRender() } }),
      ]),
      Button({
        label: 'Сохранить',
        color: 'primary',
        style: S.btn,
        onClick: () => {
          if (!draft.name.trim()) return
          const medications = this.getMedications()
          if (isNew) {
            draft.id = generateId()
            medications.push(draft)
          } else {
            const idx = medications.findIndex(m => m.id === draft.id)
            if (idx >= 0) medications[idx] = draft
          }
          this.setMedications(medications)
          this.navigateTo('list')
        },
      }),
      Button({ label: 'Назад', color: 'default', style: S.btn, onClick: () => this.navigateTo('list') }),
    ])
  },
```

- [ ] **Step 3: Переписать `renderIntakeList`**

Заменить тело `renderIntakeList()` (строки 218–255) на:

```js
  renderIntakeList() {
    const intakes = this.getIntakes()
    const medications = this.getMedications()
    const medMap = {}
    for (const med of medications) medMap[med.id] = med

    const rows = []
    for (const intake of intakes) {
      const daysText = intake.weekDays && intake.weekDays.length
        ? intake.weekDays.map(d => dayName(d)).join(', ')
        : 'Каждый день'
      const itemsText = (intake.items || []).map(item => {
        const med = medMap[item.medicationId]
        const name = med ? med.name : '?'
        return name + ' \u00d7 ' + (item.amount || '')
      }).join(', ')

      rows.push(
        View(
          { style: S.row, onClick: () => this.navigateTo('intakeEdit', { intake }) },
          [
            Text({ bold: true }, [(intake.label || intake.time) + ' — ' + intake.time]),
            Text({ style: S.rowSub }, [daysText + (itemsText ? ' · ' + itemsText : '')]),
          ],
        ),
      )
    }

    const listChildren = rows.length ? rows : [Text({ style: S.hint }, ['Нет приёмов. Добавьте первый.'])]

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, ['Приёмы']),
      Section({ title: 'Расписание', style: S.section }, listChildren),
      Button({ label: '+ Добавить приём', color: 'primary', style: S.btn, onClick: () => this.navigateTo('intakeEdit', { intake: null }) }),
      Button({ label: 'Назад', color: 'default', style: S.btn, onClick: () => this.navigateTo('list') }),
    ])
  },
```

- [ ] **Step 4: Переписать `renderIntakeEdit`**

Заменить тело `renderIntakeEdit()` (строки 259–336) на:

```js
  renderIntakeEdit() {
    const draft = this.state.intakeDraft
    const isNew = !draft.id
    const medications = this.getMedications()
    const medMap = {}
    for (const med of medications) medMap[med.id] = med
    const everyDay = !draft.weekDays || draft.weekDays.length === 0
    const weekDaysValue = everyDay ? [] : draft.weekDays.map(d => String(d))

    const itemRows = []
    for (let i = 0; i < draft.items.length; i++) {
      const item = draft.items[i]
      const med = medMap[item.medicationId]
      const name = med ? med.name : '?'
      itemRows.push(
        View(
          { style: S.row, onClick: () => this.navigateTo('itemEdit', { index: i }) },
          [Text({ bold: true }, [name + ' \u00d7 ' + (item.amount || '')])],
        ),
      )
    }

    const itemChildren = itemRows.length ? itemRows : [Text({ style: S.hint }, ['Нет лекарств в приёме'])]

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, [isNew ? 'Добавить приём' : 'Редактировать приём']),
      Section({ title: 'Время', style: S.section }, [
        TextInput({ label: 'Время', placeholder: 'ЧЧ:ММ', value: draft.time, onChange: v => { draft.time = v; this.forceRender() } }),
        TextInput({ label: 'Метка (утро/день/вечер)', placeholder: 'Метка', value: draft.label, onChange: v => { draft.label = v; this.forceRender() } }),
        Toggle({ label: 'Каждый день', value: everyDay, onChange: v => { draft.weekDays = v ? null : []; this.forceRender() } }),
        Select({
          label: 'Дни недели',
          title: 'Дни недели',
          options: DAY_NAMES,
          multiple: true,
          value: weekDaysValue,
          onChange: v => {
            const arr = Array.isArray(v) ? v : [v]
            draft.weekDays = arr.map(x => Number(x))
            this.forceRender()
          },
        }),
      ]),
      Section({ title: 'Лекарства', style: S.section }, itemChildren),
      Button({ label: '+ Добавить лекарство', color: 'primary', style: S.btn, onClick: () => this.navigateTo('itemEdit', { index: -1 }) }),
      Button({
        label: 'Сохранить',
        color: 'primary',
        style: S.btn,
        onClick: () => {
          if (!draft.time.trim() || draft.items.length === 0) return
          const intakes = this.getIntakes()
          if (isNew) {
            draft.id = generateId()
            intakes.push(draft)
          } else {
            const idx = intakes.findIndex(x => x.id === draft.id)
            if (idx >= 0) intakes[idx] = draft
          }
          this.setIntakes(intakes)
          this.navigateTo('intakes')
        },
      }),
      !isNew && Button({
        label: 'Удалить',
        color: 'default',
        style: S.btn,
        onClick: () => {
          const intakes = this.getIntakes().filter(x => x.id !== draft.id)
          this.setIntakes(intakes)
          this.navigateTo('intakes')
        },
      }),
      Button({ label: 'Назад', color: 'default', style: S.btn, onClick: () => this.navigateTo('intakes') }),
    ])
  },
```

- [ ] **Step 5: Переписать `renderItemEdit`**

Заменить тело `renderItemEdit()` (строки 340–410) на:

```js
  renderItemEdit() {
    const draft = this.state.itemDraft
    const medications = this.getMedications()
    const index = this.state.editingItemIndex
    const isEditing = index >= 0

    const options = medications.map(m => ({ name: m.name + (m.dosage ? ' (' + m.dosage + ')' : ''), value: m.id }))
    const selectedValue = draft.medicationId ? [draft.medicationId] : []

    const rows = []
    if (medications.length === 0) {
      rows.push(Text({ style: S.hint }, ['Нет лекарств. Сначала добавьте лекарство.']))
    } else {
      rows.push(
        Section({ style: S.section }, [
          Select({
            label: 'Лекарство',
            title: 'Лекарство',
            options: options,
            value: selectedValue,
            onChange: v => {
              const arr = Array.isArray(v) ? v : [v]
              draft.medicationId = arr[0] || null
              this.forceRender()
            },
          }),
          TextInput({ label: 'Количество', placeholder: '2 таблетки', value: draft.amount, onChange: v => { draft.amount = v; this.forceRender() } }),
        ]),
      )
      rows.push(
        Button({
          label: 'Сохранить',
          color: 'primary',
          style: S.btn,
          onClick: () => {
            if (!draft.medicationId) return
            const intake = this.state.intakeDraft
            if (isEditing) {
              intake.items[index] = { ...draft }
            } else {
              intake.items.push({ ...draft })
            }
            this.navigateTo('intakeEdit', { intake })
          },
        }),
      )
      if (isEditing) {
        rows.push(
          Button({
            label: 'Удалить из приёма',
            color: 'default',
            style: S.btn,
            onClick: () => {
              this.state.intakeDraft.items.splice(index, 1)
              this.navigateTo('intakeEdit', { intake: this.state.intakeDraft })
            },
          }),
        )
      }
    }

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, ['Лекарство в приёме']),
      ...rows,
      Button({ label: 'Назад', color: 'default', style: S.btn, onClick: () => this.navigateTo('intakeEdit', { intake: this.state.intakeDraft }) }),
    ])
  },
```

- [ ] **Step 6: Переписать `renderHistory`**

Заменить тело `renderHistory()` (строки 414–463) на:

```js
  renderHistory() {
    const dateStr = this.state.viewHistoryDate || todayDateStr()
    const records = this.getHistoryForDate(dateStr)
    const medications = this.getMedications()
    const medMap = {}
    for (const med of medications) medMap[med.id] = med

    const rows = []
    for (const rec of records) {
      const statusText = rec.status === 'taken'
        ? 'Принято в ' + (rec.takenTime || rec.time)
        : (rec.status === 'cancelled' ? 'Отменено' : rec.status)
      const itemsText = (rec.items || []).map(item => {
        const med = medMap[item.medicationId]
        const name = med ? med.name : '?'
        return name + ' \u00d7 ' + (item.amount || '')
      }).join(', ')
      rows.push(View({ style: S.row }, [
        Text({ bold: true }, [(rec.time || '') + ' — ' + statusText]),
        itemsText ? Text({ style: S.rowSub }, [itemsText]) : null,
      ]))
    }

    const listChildren = rows.length ? rows : [Text({ style: S.hint }, ['Нет данных за эту дату'])]

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, ['История']),
      Section({ title: 'Период', style: S.section }, [
        TextInput({
          label: 'Дата (ГГГГ-ММ-ДД)',
          value: dateStr,
          onChange: v => {
            this.state.viewHistoryDate = v
            this.forceRender()
          },
        }),
      ]),
      Section({ title: 'Записи', style: S.section }, listChildren),
      Button({
        label: 'Назад',
        color: 'default',
        style: S.btn,
        onClick: () => {
          this.state.viewHistoryDate = null
          this.navigateTo('list')
        },
      }),
    ])
  },
```

- [ ] **Step 7: Запустить тесты**

Run: `npm test` (в каталоге `src/`)
Expected: все 15 тестов PASS.

- [ ] **Step 8: Закоммитить**

```bash
git add setting/index.js
git commit -m "style: нативные секции на остальных страницах настроек"
```

---

### Task 5: Финальная проверка

**Files:**
- нет изменений (проверка)

- [ ] **Step 1: Полный прогон тестов**

Run: `npm test` (в каталоге `src/`)
Expected: все 15 тестов PASS, 0 failures.

- [ ] **Step 2: Ручная проверка в приложении Zepp**

Проверить в приложении Zepp (симулятор или устройство), что:
- страницы «Лекарства», «Приёмы», «Настройки», «История» и все редакторы отображаются с нативными секциями;
- поля, переключатели и кнопки читаемы (размер текста стандартный);
- навигация (тап по строке, кнопки «Назад», «Сохранить», «Добавить») работает.

- [ ] **Step 3: Показать итоговый diff**

Run: `git log --oneline bebf2b4..HEAD` и `git diff bebf2b4..HEAD --stat`
Expected: 5 коммитов (test + 3 style + docs-спека) поверх `bebf2b4`.
