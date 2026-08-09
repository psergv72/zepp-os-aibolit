const STORAGE_KEYS = {
  medications: 'medications',
  intakes: 'intakes',
  settings: 'settings',
  debugInfo: 'debugInfo',
  debugRefresh: 'debugRefresh',
  debugClear: 'debugClear',
}

const DEFAULT_SETTINGS = { retryInterval: 5, syncInterval: 60, snoozeOptions: [30, 45, 60, 90], minFontSize: 16, debugMode: false }

const DEBUG_POLL_INTERVAL_MS = 700
const DEBUG_POLL_TIMEOUT_MS = 15000

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
  fieldRow: { display: 'flex', flexDirection: 'row', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #ecedf0' },
  fieldRowLast: { display: 'flex', flexDirection: 'row', alignItems: 'center', padding: '14px 16px' },
  fieldLabel: { fontSize: '15px', color: '#333333', marginRight: '12px', flexShrink: '0', width: '42%' },
  inputLabel: { fontSize: '13px', color: '#b0b3b8' },
  rowTitle: { display: 'block', fontSize: '16px', fontWeight: '600' },
  rowSub: { display: 'block', fontSize: '13px', color: '#8a8a8f', marginTop: '2px' },
  bullet: { display: 'block', fontSize: '13px', color: '#8a8a8f', marginTop: '2px', paddingLeft: '20px' },
  chevron: { fontSize: '20px', color: '#c7c7cc', marginLeft: '8px' },
  hint: { fontSize: '14px', color: '#8a8a8f' },
  debugStatus: { display: 'block', fontSize: '13px', color: '#8a8a8f', marginTop: '10px' },
  linkAdd: { fontSize: '16px', fontWeight: '600', color: '#2f6fed' },
  linkBack: { display: 'block', padding: '4px 0', marginBottom: '2px' },
  linkBackText: { fontSize: '15px', fontWeight: '400', color: '#555555' },
  btnDefault: { display: 'block', width: '100%', borderRadius: '12px', background: '#ffffff', color: '#333333', border: '1px solid #d9dae0', fontSize: '16px', fontWeight: '600', marginTop: '10px' },
  btnRow: { display: 'flex', flexDirection: 'row', marginTop: '10px' },
  btnHalfPrimary: { flex: 1, borderRadius: '12px', background: '#2f6fed', color: '#ffffff', fontSize: '16px', fontWeight: '600' },
  btnHalfDefault: { flex: 1, marginLeft: '10px', borderRadius: '12px', background: '#ffffff', color: '#333333', border: '1px solid #d9dae0', fontSize: '16px', fontWeight: '600' },
}

function rowNode(content, onClick, last) {
  const style = last ? S.rowLast : S.row
  return onClick
    ? View({ style, onClick }, content)
    : View({ style }, content)
}

function fieldRow(label, control, last) {
  return View({ style: last ? S.fieldRowLast : S.fieldRow }, [
    Text({ style: S.fieldLabel }, [label]),
    View({ style: { flex: 1 } }, [control]),
  ])
}

function textField(name, value, onChange, last) {
  return View({ style: last ? S.fieldRowLast : S.fieldRow }, [
    TextInput({ label: name, labelStyle: S.inputLabel, placeholder: name, value: value || '', onChange }),
  ])
}

function backLink(onClick) {
  return View({ style: S.linkBack, onClick }, [
    Text({ style: S.linkBackText }, ['‹ Назад']),
  ])
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

function timeMinutes(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str || '')
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0
}

function normalizeTime(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec((str || '').trim())
  return m
    ? String(Number(m[1])).padStart(2, '0') + ':' + m[2]
    : (str || '').trim()
}

function daySortKey(intake) {
  const days = intake.weekDays && intake.weekDays.length ? intake.weekDays.slice().sort((a, b) => a - b) : null
  return days ? days[0] : 0
}

function weekDaysText(weekDays) {
  if (!weekDays || weekDays.length === 0) return null
  return weekDays.slice().sort((a, b) => a - b).map(d => dayName(d)).join(', ')
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
    debugWaiting: false,
    debugTimedOut: false,
    debugPollTimer: null,
    debugLastRaw: null,
    debugRequestedAt: 0,
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
    const stored = this.getItem(STORAGE_KEYS.settings, null)
    return { ...DEFAULT_SETTINGS, ...(stored || {}) }
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
    this.stopDebugPolling()
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
    } else if (page === 'debug') {
      this.requestDebugRefresh()
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
      case 'debug':
        return this.renderDebugPage()
      case 'medications':
        return this.renderMedicationList()
      default:
        return this.renderHomePage()
    }
  },

  // ── Home (Navigation) Page ──

  renderHomePage() {
    const appSettings = this.getAppSettings()
    const navItems = [
      { label: 'Лекарства', page: 'medications' },
      { label: 'Режим приема лекарств', page: 'intakes' },
      { label: 'История', page: 'history' },
      { label: 'Настройки', page: 'settings' },
    ]
    if (appSettings.debugMode) {
      navItems.push({ label: 'Отладка', page: 'debug' })
    }

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
      const medIntakes = intakes
        .filter(x => (x.items || []).some(item => item.medicationId === med.id))
        .slice()
        .sort((a, b) => timeMinutes(a.time) - timeMinutes(b.time))
      const intakeLines = medIntakes.map(intake => {
        const item = (intake.items || []).find(i => i.medicationId === med.id)
        const amount = item && item.amount ? ', ' + item.amount : ''
        const wd = weekDaysText(intake.weekDays)
        const daysText = wd ? ' ' + wd : ''
        return Text({ style: S.bullet }, ['• ' + intake.time + daysText + amount])
      })
      return rowNode(
        [
          View({ style: { flex: 1 } }, [
            Text({ style: S.rowTitle }, [med.name + ' (' + med.dosage + ')' + (!med.enabled ? ' [OFF]' : '')]),
            ...intakeLines,
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
      backLink(() => this.navigateTo('list')),
      Text({ style: S.groupTitle }, ['Лекарства']),
      View({ style: S.card }, medCard),
    ])
  },

  // ── Medication Edit Page ──

  renderMedicationEdit() {
    const draft = this.state.editDraft
    const isNew = !draft.id

    return View({ style: S.page }, [
      backLink(() => this.navigateTo('medications')),
      Text({ style: S.groupTitle }, ['Лекарство']),
      View({ style: S.card }, [
        textField('Название', draft.name, v => { draft.name = v; this.forceRender() }),
        textField('Дозировка', draft.dosage, v => { draft.dosage = v; this.forceRender() }),
        textField('Комментарии', draft.comments, v => { draft.comments = v; this.forceRender() }),
        fieldRow('Активно', Toggle({ value: draft.enabled, onChange: v => { draft.enabled = v; this.forceRender() } }), true),
      ]),
      View({ style: S.btnRow }, [
        Button({
          label: 'Сохранить',
          color: 'primary',
          style: S.btnHalfPrimary,
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
        Button({ label: 'Отмена', color: 'default', style: S.btnHalfDefault, onClick: () => this.navigateTo('medications') }),
      ]),
    ])
  },

  // ── Intake List Page ──

  renderIntakeList() {
    const intakes = this.getIntakes()
    const medications = this.getMedications()
    const medMap = {}
    for (const med of medications) medMap[med.id] = med

    const sorted = intakes.slice().sort((a, b) => {
      const ta = timeMinutes(a.time)
      const tb = timeMinutes(b.time)
      if (ta !== tb) return ta - tb
      return daySortKey(a) - daySortKey(b)
    })

    const rows = sorted.map(intake => {
      const daysText = weekDaysText(intake.weekDays) || 'каждый день'
      const labelPrefix = intake.label ? intake.label + ' — ' : ''
      const timeLine = labelPrefix + intake.time + ', ' + daysText

      const medLines = (intake.items || []).map(item => {
        const med = medMap[item.medicationId]
        const name = med ? med.name : '?'
        const dosage = med && med.dosage ? ' (' + med.dosage + ')' : ''
        const amount = item.amount ? ', ' + item.amount : ''
        return Text({ style: S.bullet }, ['• ' + name + dosage + amount])
      })

      return rowNode(
        [
          View({ style: { flex: 1 } }, [
            Text({ style: S.rowTitle }, [timeLine]),
            ...medLines,
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
      backLink(() => this.navigateTo('list')),
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
      backLink(() => this.navigateTo('intakes')),
      Text({ style: S.title, bold: true }, [isNew ? 'Добавить приём' : 'Редактировать приём']),
      Text({ style: S.groupTitle }, ['Время']),
      View({ style: S.card }, [
        textField('Время', draft.time, v => { draft.time = v; this.forceRender() }),
        textField('Метка (утро/день/вечер)', draft.label, v => { draft.label = v; this.forceRender() }),
        fieldRow('Каждый день', Toggle({ value: everyDay, onChange: v => { draft.weekDays = v ? null : []; this.forceRender() } })),
        fieldRow('Дни недели', Select({
          title: 'Дни недели',
          options: DAY_NAMES,
          multiple: true,
          value: weekDaysValue,
          onChange: v => {
            const arr = Array.isArray(v) ? v : [v]
            draft.weekDays = arr.map(x => Number(x))
            this.forceRender()
          },
        }), true),
      ]),
      Text({ style: S.groupTitle }, ['Лекарства']),
      View({ style: S.card }, itemChildren),
      View({ style: S.btnRow }, [
        Button({
          label: 'Сохранить',
          color: 'primary',
          style: S.btnHalfPrimary,
          onClick: () => {
            if (!draft.time.trim() || draft.items.length === 0) return
            draft.time = normalizeTime(draft.time)
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
        Button({ label: 'Отмена', color: 'default', style: S.btnHalfDefault, onClick: () => this.navigateTo('intakes') }),
      ]),
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
          fieldRow('Лекарство', Select({
            title: 'Лекарство',
            options: options,
            value: selectedValue,
            onChange: v => {
              const arr = Array.isArray(v) ? v : [v]
              draft.medicationId = arr[0] || null
              this.forceRender()
            },
          })),
          textField('Количество', draft.amount, v => { draft.amount = v; this.forceRender() }, true),
        ]),
      )
      rows.push(
        View({ style: S.btnRow }, [
          Button({
            label: 'Сохранить',
            color: 'primary',
            style: S.btnHalfPrimary,
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
          Button({ label: 'Отмена', color: 'default', style: S.btnHalfDefault, onClick: () => this.navigateTo('intakeEdit', { intake: this.state.intakeDraft }) }),
        ]),
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
      backLink(() => this.navigateTo('intakeEdit', { intake: this.state.intakeDraft })),
      Text({ style: S.title, bold: true }, ['Лекарство в приёме']),
      ...rows,
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
      backLink(() => {
        this.state.viewHistoryDate = null
        this.navigateTo('list')
      }),
      Text({ style: S.title, bold: true }, ['История']),
      Text({ style: S.groupTitle }, ['Период']),
      View({ style: S.card }, [
        textField('Дата (ГГГГ-ММ-ДД)', dateStr, v => {
          this.state.viewHistoryDate = v
          this.forceRender()
        }, true),
      ]),
      Text({ style: S.groupTitle }, ['Записи']),
      View({ style: S.card }, listChildren),
    ])
  },

  // ── Debug Page ──

  getDebugInfo() {
    const data = this.storage().getItem(STORAGE_KEYS.debugInfo)
    if (!data) return null
    try {
      return JSON.parse(data)
    } catch (e) {
      return null
    }
  },

  requestDebugRefresh() {
    const prev = this.storage().getItem(STORAGE_KEYS.debugRefresh)
    const next = (prev ? Number(prev) : Date.now()) + 1
    this.storage().setItem(STORAGE_KEYS.debugRefresh, String(next))
    this.state.debugWaiting = true
    this.state.debugTimedOut = false
    this.state.debugRequestedAt = Date.now()
    this.startDebugPolling()
    this.forceRender()
  },

  clearDebug() {
    this.storage().removeItem(STORAGE_KEYS.debugInfo)
    this.state.debugWaiting = false
    this.state.debugTimedOut = false
    const prev = this.storage().getItem(STORAGE_KEYS.debugClear)
    const next = (prev ? Number(prev) : Date.now()) + 1
    this.storage().setItem(STORAGE_KEYS.debugClear, String(next))
    this.forceRender()
  },

  startDebugPolling() {
    if (this.state.debugPollTimer) return
    this.state.debugLastRaw = this.storage().getItem(STORAGE_KEYS.debugInfo) || null
    this.state.debugPollTimer = setInterval(() => this.debugPollTick(), DEBUG_POLL_INTERVAL_MS)
  },

  stopDebugPolling() {
    if (this.state.debugPollTimer) {
      clearInterval(this.state.debugPollTimer)
      this.state.debugPollTimer = null
    }
  },

  debugPollTick() {
    const raw = this.storage().getItem(STORAGE_KEYS.debugInfo) || null
    const changed = raw !== this.state.debugLastRaw
    this.state.debugLastRaw = raw
    if (changed) {
      this.state.debugWaiting = false
      this.state.debugTimedOut = false
      this.forceRender()
      return
    }
    if (this.state.debugWaiting && Date.now() - this.state.debugRequestedAt > DEBUG_POLL_TIMEOUT_MS) {
      this.state.debugWaiting = false
      this.state.debugTimedOut = true
      this.forceRender()
    }
  },

  debugStatusText(info) {
    const s = this.state
    if (s.debugWaiting) return 'Запрос отправлен на часы, ждём ответ...'
    if (s.debugTimedOut) return 'Часы не ответили. Откройте Aibolit на часах и нажмите «Обновить».'
    if (info && info.ts) return 'Данные часов от ' + this.formatDebugTime(info.ts)
    if (info) return 'Данные часов получены'
    return 'Данные часов ещё не получены. Нажмите «Обновить».'
  },
  formatDebugTime(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0')
  },

  formatNextTime(ts) {
    if (!ts) return ''
    const d = new Date(ts * 1000)
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  },

  debugTimerText(timer) {
    if (!timer || typeof timer !== 'object') return String(timer)
    const id = 'id=' + timer.id
    switch (timer.type) {
      case 'intake': {
        const days = weekDaysText(timer.weekDays) || 'каждый день'
        const label = timer.label ? ' (' + timer.label + ')' : ''
        const items = timer.items ? ' — ' + timer.items : ''
        const next = timer.next ? ' (' + this.formatNextTime(timer.next) + ')' : ''
        return timer.time + label + items + ' · ' + days + ' ' + id + next
      }
      case 'snooze':
        return 'Отложка приёма ' + (timer.intakeId || '?') + ' ' + id
      case 'sync':
        return 'Синхронизация (каждые ' + (timer.interval !== undefined ? timer.interval : '?') + ' мин) ' + id
      case 'retryTick':
        return 'Периодический тик повтора ' + id
      default:
        return id
    }
  },

  renderDebugPage() {
    const info = this.getDebugInfo()
    const timers = (info && info.timers) || []
    const log = (info && info.log) || []

    const timerRows = timers.length
      ? timers.map((timer, i) => rowNode(
        [Text({ style: S.rowSub }, [this.debugTimerText(timer)])],
        null,
        i === timers.length - 1,
      ))
      : [rowNode([Text({ style: S.hint }, ['Нет активных таймеров'])], null, true)]

    const logRows = log.length
      ? log.slice().reverse().map((entry, i) => rowNode(
        [Text({ style: S.rowSub }, [(entry.ts ? this.formatDebugTime(entry.ts) + ' ' : '') + (entry.message || '')])],
        null,
        i === log.length - 1,
      ))
      : [rowNode([Text({ style: S.hint }, ['Нет отладочных сообщений'])], null, true)]

    return View({ style: S.page }, [
      backLink(() => this.navigateTo('list')),
      View({ style: S.btnRow }, [
        Button({
          label: 'Обновить',
          color: 'primary',
          style: S.btnHalfPrimary,
          onClick: () => this.requestDebugRefresh(),
        }),
        Button({
          label: 'Очистить',
          color: 'default',
          style: S.btnHalfDefault,
          onClick: () => this.clearDebug(),
        }),
      ]),
      Text({ style: S.debugStatus }, [this.debugStatusText(info)]),
      Text({ style: S.groupTitle }, ['Таймеры на часах']),
      View({ style: S.card }, timerRows),
      Text({ style: S.groupTitle }, ['Отладочные сообщения']),
      View({ style: S.card }, logRows),
    ])
  },

  // ── Settings Page ──

  renderSettingsPage() {
    const draft = this.state.settingsDraft

    return View({ style: S.page }, [
      backLink(() => this.navigateTo('list')),
      Text({ style: S.groupTitle }, ['Напоминания']),
      View({ style: S.card }, [
        textField('Интервал повтора (мин)', String(draft.retryInterval), v => { draft.retryInterval = parseInt(v, 10) || 5; this.forceRender() }),
        textField('Интервал синхронизации (мин)', String(draft.syncInterval), v => { draft.syncInterval = parseInt(v, 10) || 60; this.forceRender() }),
        textField('Варианты отложки (мин, через запятую)', draft.snoozeOptions.join(', '), v => { draft.snoozeOptions = v.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)); this.forceRender() }, true),
      ]),
      Text({ style: S.groupTitle }, ['Отображение']),
      View({ style: S.card }, [
        textField('Минимальный размер шрифта (16-40)', String(draft.minFontSize || 16), v => { draft.minFontSize = Math.max(16, parseInt(v, 10) || 16); this.forceRender() }, true),
      ]),
      Text({ style: S.groupTitle }, ['Отладка']),
      View({ style: S.card }, [
        fieldRow('Отладочный режим', Toggle({ value: !!draft.debugMode, onChange: v => { draft.debugMode = v; this.forceRender() } }), true),
      ]),
      View({ style: S.btnRow }, [
        Button({
          label: 'Сохранить',
          color: 'primary',
          style: S.btnHalfPrimary,
          onClick: () => {
            this.setAppSettings(draft)
            this.navigateTo('list')
          },
        }),
        Button({ label: 'Отмена', color: 'default', style: S.btnHalfDefault, onClick: () => this.navigateTo('list') }),
      ]),
    ])
  },
})
