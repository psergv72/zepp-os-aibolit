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
  page: { padding: '12px 20px', background: '#f2f3f5', minHeight: '100vh' },
  title: { display: 'block', fontSize: '22px', fontWeight: '700', marginBottom: '10px' },
  groupTitle: { display: 'block', fontSize: '12px', color: '#8a8a8f', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '20px', marginBottom: '8px' },
  card: { background: '#ffffff', borderRadius: '12px', border: '1px solid #ecedf0' },
  row: { padding: '13px 16px', borderBottom: '1px solid #ecedf0', display: 'flex', flexDirection: 'row', alignItems: 'center' },
  rowLast: { padding: '13px 16px', display: 'flex', flexDirection: 'row', alignItems: 'center' },
  control: { padding: '8px 16px', borderBottom: '1px solid #ecedf0' },
  controlLast: { padding: '8px 16px' },
  rowTitle: { fontSize: '16px', fontWeight: '600' },
  rowSub: { fontSize: '13px', color: '#8a8a8f', marginTop: '2px' },
  chevron: { fontSize: '20px', color: '#c7c7cc', marginLeft: '8px' },
  hint: { fontSize: '14px', color: '#8a8a8f' },
  linkAdd: { fontSize: '16px', fontWeight: '600', color: '#2f6fed' },
  linkBack: { display: 'block', padding: '4px 0', marginBottom: '2px' },
  linkBackText: { fontSize: '15px', fontWeight: '400', color: '#555555' },
  btnPrimary: { display: 'block', width: '100%', borderRadius: '12px', background: '#2f6fed', color: '#ffffff', fontSize: '16px', fontWeight: '600', marginTop: '10px' },
  btnDefault: { display: 'block', width: '100%', borderRadius: '12px', background: '#ffffff', color: '#333333', border: '1px solid #d9dae0', fontSize: '16px', fontWeight: '600', marginTop: '10px' },
}

function rowNode(content, onClick, last) {
  const style = last ? S.rowLast : S.row
  return onClick
    ? View({ style, onClick }, content)
    : View({ style }, content)
}

function controlRow(content, last) {
  return View({ style: last ? S.controlLast : S.control }, content)
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
      case 'medications':
        return this.renderMedicationList()
      default:
        return this.renderHomePage()
    }
  },

  // ── Home (Navigation) Page ──

  renderHomePage() {
    const navItems = [
      { label: 'Лекарства', page: 'medications' },
      { label: 'Приёмы', page: 'intakes' },
      { label: 'История', page: 'history' },
      { label: 'Настройки', page: 'settings' },
    ]

    const navRows = navItems.map((item, i) => rowNode(
      [
        View({ style: { flex: 1 } }, [Text({ style: S.rowTitle }, [item.label])]),
        Text({ style: S.chevron }, ['›']),
      ],
      () => this.navigateTo(item.page),
      i === navItems.length - 1,
    ))

    return View({ style: S.page }, [
      Text({ style: S.groupTitle }, ['Управление']),
      View({ style: S.card }, navRows),
    ])
  },

  // ── Medication List Page ──

  renderMedicationList() {
    const medications = this.getMedications()
    const intakes = this.getIntakes()

    const medRows = medications.map(med => {
      const intakeCount = intakes.filter(x => (x.items || []).some(item => item.medicationId === med.id)).length
      const subText = intakeCount > 0 ? 'в ' + intakeCount + ' приёмах' : ''
      return rowNode(
        [
          View({ style: { flex: 1 } }, [
            Text({ style: S.rowTitle }, [med.name + ' (' + med.dosage + ')' + (!med.enabled ? ' [OFF]' : '')]),
            subText ? Text({ style: S.rowSub }, [subText]) : null,
          ]),
          Text({ style: S.chevron }, ['›']),
        ],
        () => this.navigateTo('edit', { medication: med }),
        false,
      )
    })

    const addRow = rowNode(
      [Text({ style: S.linkAdd }, ['+ Добавить лекарство'])],
      () => this.navigateTo('edit', { medication: null }),
      true,
    )

    const medCard = medRows.length
      ? [...medRows, addRow]
      : [rowNode([Text({ style: S.hint }, ['Нет лекарств. Добавьте первое.'])], null, false), addRow]

    return View({ style: S.page }, [
      View({ style: S.linkBack, onClick: () => this.navigateTo('list') }, [
        Text({ style: S.linkBackText }, ['‹ Назад']),
      ]),
      Text({ style: S.groupTitle }, ['Лекарства']),
      View({ style: S.card }, medCard),
    ])
  },

  // ── Medication Edit Page ──

  renderMedicationEdit() {
    const draft = this.state.editDraft
    const isNew = !draft.id

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, [isNew ? 'Добавить лекарство' : 'Редактировать лекарство']),
      Text({ style: S.groupTitle }, ['Основное']),
      View({ style: S.card }, [
        controlRow([TextInput({ label: 'Название', placeholder: 'Название', value: draft.name, onChange: v => { draft.name = v; this.forceRender() } })]),
        controlRow([TextInput({ label: 'Дозировка', placeholder: 'Дозировка', value: draft.dosage, onChange: v => { draft.dosage = v; this.forceRender() } })]),
        controlRow([TextInput({ label: 'Комментарии', placeholder: 'Комментарии', value: draft.comments, onChange: v => { draft.comments = v; this.forceRender() } })]),
        controlRow([Toggle({ label: 'Активно', value: draft.enabled, onChange: v => { draft.enabled = v; this.forceRender() } })], true),
      ]),
      Button({
        label: 'Сохранить',
        color: 'primary',
        style: S.btnPrimary,
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
          this.navigateTo('medications')
        },
      }),
      Button({ label: 'Назад', color: 'default', style: S.btnDefault, onClick: () => this.navigateTo('medications') }),
    ])
  },

  // ── Intake List Page ──

  renderIntakeList() {
    const intakes = this.getIntakes()
    const medications = this.getMedications()
    const medMap = {}
    for (const med of medications) medMap[med.id] = med

    const rows = intakes.map(intake => {
      const daysText = intake.weekDays && intake.weekDays.length
        ? intake.weekDays.map(d => dayName(d)).join(', ')
        : 'Каждый день'
      const itemsText = (intake.items || []).map(item => {
        const med = medMap[item.medicationId]
        const name = med ? med.name : '?'
        return name + ' \u00d7 ' + (item.amount || '')
      }).join(', ')

      return rowNode(
        [
          View({ style: { flex: 1 } }, [
            Text({ style: S.rowTitle }, [(intake.label || intake.time) + ' — ' + intake.time]),
            Text({ style: S.rowSub }, [daysText + (itemsText ? ' · ' + itemsText : '')]),
          ]),
          Text({ style: S.chevron }, ['›']),
        ],
        () => this.navigateTo('intakeEdit', { intake }),
        false,
      )
    })

    const addRow = rowNode(
      [Text({ style: S.linkAdd }, ['+ Добавить приём'])],
      () => this.navigateTo('intakeEdit', { intake: null }),
      true,
    )

    const listChildren = rows.length
      ? [...rows, addRow]
      : [rowNode([Text({ style: S.hint }, ['Нет приёмов. Добавьте первый.'])], null, false), addRow]

    return View({ style: S.page }, [
      View({ style: S.linkBack, onClick: () => this.navigateTo('list') }, [
        Text({ style: S.linkBackText }, ['‹ Назад']),
      ]),
      Text({ style: S.groupTitle }, ['Режим приема лекарств']),
      View({ style: S.card }, listChildren),
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

    const itemRows = draft.items.map((item, i) => {
      const med = medMap[item.medicationId]
      const name = med ? med.name : '?'
      return rowNode(
        [
          View({ style: { flex: 1 } }, [Text({ style: S.rowTitle }, [name + ' \u00d7 ' + (item.amount || '')])]),
          Text({ style: S.chevron }, ['›']),
        ],
        () => this.navigateTo('itemEdit', { index: i }),
        false,
      )
    })

    const addRow = rowNode(
      [Text({ style: S.linkAdd }, ['+ Добавить лекарство'])],
      () => this.navigateTo('itemEdit', { index: -1 }),
      true,
    )

    const itemChildren = itemRows.length
      ? [...itemRows, addRow]
      : [rowNode([Text({ style: S.hint }, ['Нет лекарств в приёме'])], null, false), addRow]

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, [isNew ? 'Добавить приём' : 'Редактировать приём']),
      Text({ style: S.groupTitle }, ['Время']),
      View({ style: S.card }, [
        controlRow([TextInput({ label: 'Время', placeholder: 'ЧЧ:ММ', value: draft.time, onChange: v => { draft.time = v; this.forceRender() } })]),
        controlRow([TextInput({ label: 'Метка (утро/день/вечер)', placeholder: 'Метка', value: draft.label, onChange: v => { draft.label = v; this.forceRender() } })]),
        controlRow([Toggle({ label: 'Каждый день', value: everyDay, onChange: v => { draft.weekDays = v ? null : []; this.forceRender() } })]),
        controlRow([Select({
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
        })], true),
      ]),
      Text({ style: S.groupTitle }, ['Лекарства']),
      View({ style: S.card }, itemChildren),
      Button({
        label: 'Сохранить',
        color: 'primary',
        style: S.btnPrimary,
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
        style: S.btnDefault,
        onClick: () => {
          const intakes = this.getIntakes().filter(x => x.id !== draft.id)
          this.setIntakes(intakes)
          this.navigateTo('intakes')
        },
      }),
      Button({ label: 'Назад', color: 'default', style: S.btnDefault, onClick: () => this.navigateTo('intakes') }),
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
        View({ style: S.card }, [
          controlRow([Select({
            label: 'Лекарство',
            title: 'Лекарство',
            options: options,
            value: selectedValue,
            onChange: v => {
              const arr = Array.isArray(v) ? v : [v]
              draft.medicationId = arr[0] || null
              this.forceRender()
            },
          })]),
          controlRow([TextInput({ label: 'Количество', placeholder: '2 таблетки', value: draft.amount, onChange: v => { draft.amount = v; this.forceRender() } })], true),
        ]),
      )
      rows.push(
        Button({
          label: 'Сохранить',
          color: 'primary',
          style: S.btnPrimary,
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
            style: S.btnDefault,
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
      Button({ label: 'Назад', color: 'default', style: S.btnDefault, onClick: () => this.navigateTo('intakeEdit', { intake: this.state.intakeDraft }) }),
    ])
  },

  // ── History Page ──

  renderHistory() {
    const dateStr = this.state.viewHistoryDate || todayDateStr()
    const records = this.getHistoryForDate(dateStr)
    const medications = this.getMedications()
    const medMap = {}
    for (const med of medications) medMap[med.id] = med

    const rows = records.map((rec, i) => {
      const statusText = rec.status === 'taken'
        ? 'Принято в ' + (rec.takenTime || rec.time)
        : (rec.status === 'cancelled' ? 'Отменено' : rec.status)
      const itemsText = (rec.items || []).map(item => {
        const med = medMap[item.medicationId]
        const name = med ? med.name : '?'
        return name + ' \u00d7 ' + (item.amount || '')
      }).join(', ')
      return rowNode(
        [
          View({ style: { flex: 1 } }, [
            Text({ style: S.rowTitle }, [(rec.time || '') + ' — ' + statusText]),
            itemsText ? Text({ style: S.rowSub }, [itemsText]) : null,
          ]),
        ],
        null,
        i === records.length - 1,
      )
    })

    const listChildren = rows.length
      ? rows
      : [rowNode([Text({ style: S.hint }, ['Нет данных за эту дату'])], null, true)]

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, ['История']),
      Text({ style: S.groupTitle }, ['Период']),
      View({ style: S.card }, [
        controlRow([TextInput({
          label: 'Дата (ГГГГ-ММ-ДД)',
          value: dateStr,
          onChange: v => {
            this.state.viewHistoryDate = v
            this.forceRender()
          },
        })], true),
      ]),
      Text({ style: S.groupTitle }, ['Записи']),
      View({ style: S.card }, listChildren),
      Button({
        label: 'Назад',
        color: 'default',
        style: S.btnDefault,
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
      Text({ style: S.groupTitle }, ['Напоминания']),
      View({ style: S.card }, [
        controlRow([TextInput({ label: 'Интервал повтора (мин)', value: String(draft.retryInterval), onChange: v => { draft.retryInterval = parseInt(v, 10) || 60; this.forceRender() } })]),
        controlRow([TextInput({ label: 'Интервал синхронизации (мин)', value: String(draft.syncInterval), onChange: v => { draft.syncInterval = parseInt(v, 10) || 60; this.forceRender() } })]),
        controlRow([TextInput({
          label: 'Варианты отложки (мин, через запятую)',
          value: draft.snoozeOptions.join(', '),
          onChange: v => { draft.snoozeOptions = v.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)); this.forceRender() },
        })], true),
      ]),
      Text({ style: S.groupTitle }, ['Отображение']),
      View({ style: S.card }, [
        controlRow([TextInput({
          label: 'Минимальный размер шрифта (16-40)',
          value: String(draft.minFontSize || 16),
          onChange: v => { draft.minFontSize = Math.max(16, parseInt(v, 10) || 16); this.forceRender() },
        })], true),
      ]),
      Button({
        label: 'Сохранить',
        color: 'primary',
        style: S.btnPrimary,
        onClick: () => {
          this.setAppSettings(draft)
          this.navigateTo('list')
        },
      }),
      Button({ label: 'Назад', color: 'default', style: S.btnDefault, onClick: () => this.navigateTo('list') }),
    ])
  },
})
