const STORAGE_KEYS = {
  medications: 'medications',
  intakes: 'intakes',
  settings: 'settings',
}

const DEFAULT_SETTINGS = { retryInterval: 60, syncInterval: 60, snoozeOptions: [30, 45, 60, 90], minFontSize: 16 }

const DAY_NAMES = [
  { name: 'Пн', value: '1' },
  { name: 'Вт', value: '2' },
  { name: 'Ср', value: '3' },
  { name: 'Чт', value: '4' },
  { name: 'Пт', value: '5' },
  { name: 'Сб', value: '6' },
  { name: 'Вс', value: '7' },
]

const S = {
  page: { padding: '12px 20px' },
  title: { fontSize: '18px', marginBottom: '8px' },
  field: { marginBottom: '12px' },
  row: { padding: '10px 0', borderBottom: '1px solid #eaeaea' },
  rowTitle: { fontSize: '15px' },
  rowSub: { fontSize: '12px', color: '#888' },
  hint: { fontSize: '13px', color: '#888', marginTop: '10px' },
  btn: { marginTop: '10px' },
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function todayDateStr() {
  const t = new Date()
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0')
}

function dayName(d) {
  const found = DAY_NAMES.find(x => x.value === String(d))
  return found ? found.name : String(d)
}

AppSettingsPage({
  state: {
    props: null,
    page: 'list',
    editDraft: null,
    intakeDraft: null,
    itemDraft: null,
    editingItemIndex: -1,
    viewHistoryDate: null,
    settingsDraft: null,
  },

  storage() {
    return this.state.props.settingsStorage
  },

  getItem(key, defaultValue) {
    const val = this.storage().getItem(key)
    return val !== null && val !== undefined ? JSON.parse(val) : defaultValue
  },

  setItem(key, value) {
    this.storage().setItem(key, JSON.stringify(value))
  },

  getMedications() {
    return this.getItem(STORAGE_KEYS.medications, [])
  },

  setMedications(meds) {
    this.setItem(STORAGE_KEYS.medications, meds)
  },

  getIntakes() {
    return this.getItem(STORAGE_KEYS.intakes, [])
  },

  setIntakes(intakes) {
    this.setItem(STORAGE_KEYS.intakes, intakes)
  },

  getAppSettings() {
    return this.getItem(STORAGE_KEYS.settings, { ...DEFAULT_SETTINGS })
  },

  setAppSettings(s) {
    this.setItem(STORAGE_KEYS.settings, s)
  },

  getHistoryForDate(dateStr) {
    const data = this.storage().getItem('history_' + dateStr)
    return data ? JSON.parse(data) : []
  },

  forceRender() {
    this._renderSeq = (this._renderSeq || 0) + 1
    this.storage().setItem('__ui_render', String(this._renderSeq))
  },

  navigateTo(page, params) {
    this.state.page = page
    if (page === 'edit') {
      this.state.editDraft = params && params.medication
        ? { ...params.medication }
        : { name: '', dosage: '', comments: '', enabled: true, id: null }
    } else if (page === 'intakeEdit') {
      this.state.intakeDraft = params && params.intake
        ? { ...params.intake, items: (params.intake.items || []).map(i => ({ ...i })) }
        : { time: '08:00', weekDays: null, label: '', items: [], id: null }
    } else if (page === 'itemEdit') {
      const draft = this.state.intakeDraft
      const index = params && params.index !== undefined ? params.index : -1
      this.state.editingItemIndex = index
      this.state.itemDraft = index >= 0 && draft.items[index]
        ? { ...draft.items[index] }
        : { medicationId: null, amount: '' }
    } else if (page === 'history') {
      if (params && params.date !== undefined) this.state.viewHistoryDate = params.date
    } else if (page === 'settings') {
      this.state.settingsDraft = this.getAppSettings()
    }
    this.forceRender()
  },

  build(props) {
    this.state.props = props
    switch (this.state.page) {
      case 'edit':
        return this.renderMedicationEdit()
      case 'intakes':
        return this.renderIntakeList()
      case 'intakeEdit':
        return this.renderIntakeEdit()
      case 'itemEdit':
        return this.renderItemEdit()
      case 'history':
        return this.renderHistory()
      case 'settings':
        return this.renderSettingsPage()
      default:
        return this.renderMedicationList()
    }
  },

  // ── Medication List Page ──

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
            Text({ style: S.rowTitle }, [med.name + ' (' + med.dosage + ')' + (!med.enabled ? ' [OFF]' : '')]),
            subText ? Text({ style: S.rowSub }, [subText]) : null,
          ],
        ),
      )
    }
    if (rows.length === 0) {
      rows.push(Text({ style: S.hint }, ['Нет лекарств. Добавьте первое.']))
    }

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, ['Лекарства']),
      ...rows,
      Button({ label: '+ Добавить лекарство', color: 'primary', style: S.btn, onClick: () => this.navigateTo('edit', { medication: null }) }),
      Button({ label: 'Приёмы', color: 'default', style: S.btn, onClick: () => this.navigateTo('intakes') }),
      Button({ label: 'История', color: 'default', style: S.btn, onClick: () => this.navigateTo('history') }),
      Button({ label: 'Настройки', color: 'default', style: S.btn, onClick: () => this.navigateTo('settings') }),
    ])
  },

  // ── Medication Edit Page ──

  renderMedicationEdit() {
    const draft = this.state.editDraft
    const isNew = !draft.id

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, [isNew ? 'Добавить лекарство' : 'Редактировать лекарство']),
      View({ style: S.field }, [TextInput({ label: 'Название', placeholder: 'Название', value: draft.name, onChange: v => { draft.name = v; this.forceRender() } })]),
      View({ style: S.field }, [TextInput({ label: 'Дозировка', placeholder: 'Дозировка', value: draft.dosage, onChange: v => { draft.dosage = v; this.forceRender() } })]),
      View({ style: S.field }, [TextInput({ label: 'Комментарии', placeholder: 'Комментарии', value: draft.comments, onChange: v => { draft.comments = v; this.forceRender() } })]),
      View({ style: S.field }, [Toggle({ label: 'Активно', value: draft.enabled, onChange: v => { draft.enabled = v; this.forceRender() } })]),
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

  // ── Intake List Page ──

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
            Text({ style: S.rowTitle }, [(intake.label || intake.time) + ' — ' + intake.time]),
            Text({ style: S.rowSub }, [daysText + (itemsText ? ' · ' + itemsText : '')]),
          ],
        ),
      )
    }
    if (rows.length === 0) {
      rows.push(Text({ style: S.hint }, ['Нет приёмов. Добавьте первый.']))
    }

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, ['Приёмы']),
      ...rows,
      Button({ label: '+ Добавить приём', color: 'primary', style: S.btn, onClick: () => this.navigateTo('intakeEdit', { intake: null }) }),
      Button({ label: 'Назад', color: 'default', style: S.btn, onClick: () => this.navigateTo('list') }),
    ])
  },

  // ── Intake Edit Page ──

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
          [Text({ style: S.rowTitle }, [name + ' \u00d7 ' + (item.amount || '')])],
        ),
      )
    }
    if (itemRows.length === 0) {
      itemRows.push(Text({ style: S.hint }, ['Нет лекарств в приёме']))
    }

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, [isNew ? 'Добавить приём' : 'Редактировать приём']),
      View({ style: S.field }, [TextInput({ label: 'Время', placeholder: 'ЧЧ:ММ', value: draft.time, onChange: v => { draft.time = v; this.forceRender() } })]),
      View({ style: S.field }, [TextInput({ label: 'Метка (утро/день/вечер)', placeholder: 'Метка', value: draft.label, onChange: v => { draft.label = v; this.forceRender() } })]),
      View({ style: S.field }, [Toggle({ label: 'Каждый день', value: everyDay, onChange: v => { draft.weekDays = v ? null : []; this.forceRender() } })]),
      View({ style: S.field }, [
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
      Text({ style: S.title, bold: true }, ['Лекарства']),
      ...itemRows,
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

  // ── Item Edit Page ──

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
        View({ style: S.field }, [
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
        ]),
      )
      rows.push(
        View({ style: S.field }, [
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

  // ── History Page ──

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
        Text({ style: S.rowTitle }, [(rec.time || '') + ' — ' + statusText]),
        itemsText ? Text({ style: S.rowSub }, [itemsText]) : null,
      ]))
    }
    if (rows.length === 0) {
      rows.push(Text({ style: S.hint }, ['Нет данных за эту дату']))
    }

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, ['История']),
      View({ style: S.field }, [
        TextInput({
          label: 'Дата (ГГГГ-ММ-ДД)',
          value: dateStr,
          onChange: v => {
            this.state.viewHistoryDate = v
            this.forceRender()
          },
        }),
      ]),
      ...rows,
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

  // ── Settings Page ──

  renderSettingsPage() {
    const draft = this.state.settingsDraft

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, ['Настройки']),
      View({ style: S.field }, [
        TextInput({ label: 'Интервал повтора (мин)', value: String(draft.retryInterval), onChange: v => { draft.retryInterval = parseInt(v, 10) || 60; this.forceRender() } }),
      ]),
      View({ style: S.field }, [
        TextInput({ label: 'Интервал синхронизации (мин)', value: String(draft.syncInterval), onChange: v => { draft.syncInterval = parseInt(v, 10) || 60; this.forceRender() } }),
      ]),
      View({ style: S.field }, [
        TextInput({
          label: 'Варианты отложки (мин, через запятую)',
          value: draft.snoozeOptions.join(', '),
          onChange: v => { draft.snoozeOptions = v.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)); this.forceRender() },
        }),
      ]),
      View({ style: S.field }, [
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
})
