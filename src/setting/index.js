const STORAGE_KEYS = {
  medications: 'medications',
  schedule: 'schedule',
  settings: 'settings',
}

const DEFAULT_SETTINGS = { retryInterval: 60, syncInterval: 60, snoozeOptions: [30, 45, 60, 90] }

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
    slotDraft: null,
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

  getSchedule() {
    return this.getItem(STORAGE_KEYS.schedule, [])
  },

  setSchedule(sched) {
    this.setItem(STORAGE_KEYS.schedule, sched)
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
    this.storage().setItem('__ui_render', String(Date.now()))
  },

  navigateTo(page, params) {
    this.state.page = page
    if (page === 'edit') {
      this.state.editDraft = params && params.medication
        ? { ...params.medication }
        : { name: '', dosage: '', comments: '', enabled: true, id: null }
    } else if (page === 'slotEdit') {
      this.state.slotDraft = params && params.slot
        ? { ...params.slot }
        : {
            medicationId: this.state.editDraft ? this.state.editDraft.id : null,
            time: '08:00',
            weekDays: null,
            label: '',
          }
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
      case 'schedule':
        return this.renderScheduleList()
      case 'slotEdit':
        return this.renderSlotEdit()
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
    const schedule = this.getSchedule()

    const rows = []
    for (const med of medications) {
      const slotCount = schedule.filter(s => s.medicationId === med.id).length
      rows.push(
        View(
          { style: S.row, onClick: () => this.navigateTo('edit', { medication: med }) },
          [
            Text({ style: S.rowTitle }, [med.name + ' (' + med.dosage + ')' + (!med.enabled ? ' [OFF]' : '')]),
            Text({ style: S.rowSub }, [slotCount + ' приемов']),
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
      Button({ label: '+ Добавить', color: 'primary', style: S.btn, onClick: () => this.navigateTo('edit', { medication: null }) }),
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
      View({ style: S.field }, [TextInput({ label: 'Название', placeholder: 'Название', value: draft.name, onChange: v => { draft.name = v } })]),
      View({ style: S.field }, [TextInput({ label: 'Дозировка', placeholder: 'Дозировка', value: draft.dosage, onChange: v => { draft.dosage = v } })]),
      View({ style: S.field }, [TextInput({ label: 'Комментарии', placeholder: 'Комментарии', value: draft.comments, onChange: v => { draft.comments = v } })]),
      View({ style: S.field }, [Toggle({ label: 'Активно', value: draft.enabled, onChange: v => { draft.enabled = v } })]),
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
      Button({ label: 'Расписание', color: 'default', style: S.btn, onClick: () => this.navigateTo('schedule') }),
      Button({ label: 'Назад', color: 'default', style: S.btn, onClick: () => this.navigateTo('list') }),
    ])
  },

  // ── Schedule List Page ──

  renderScheduleList() {
    const medication = this.state.editDraft || { id: null }
    const medicationId = medication.id
    const slots = this.getSchedule().filter(s => s.medicationId === medicationId)

    const rows = []
    for (const slot of slots) {
      const daysText = slot.weekDays && slot.weekDays.length
        ? slot.weekDays.map(d => dayName(d)).join(', ')
        : 'Каждый день'
      rows.push(
        View(
          { style: S.row, onClick: () => this.navigateTo('slotEdit', { slot }) },
          [
            Text({ style: S.rowTitle }, [(slot.label || slot.time) + ' — ' + slot.time]),
            Text({ style: S.rowSub }, [daysText]),
          ],
        ),
      )
    }
    if (rows.length === 0) {
      rows.push(Text({ style: S.hint }, ['Нет времени приема']))
    }

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, ['Расписание']),
      ...rows,
      Button({ label: '+ Добавить время', color: 'primary', style: S.btn, onClick: () => this.navigateTo('slotEdit', { slot: null }) }),
      Button({ label: 'Назад', color: 'default', style: S.btn, onClick: () => this.navigateTo('edit', { medication }) }),
    ])
  },

  // ── Slot Edit Page ──

  renderSlotEdit() {
    const draft = this.state.slotDraft
    const isNew = !draft.id
    const everyDay = !draft.weekDays || draft.weekDays.length === 0
    const weekDaysValue = everyDay ? [] : draft.weekDays.map(d => String(d))

    return View({ style: S.page }, [
      Text({ style: S.title, bold: true }, [isNew ? 'Добавить время' : 'Редактировать время']),
      View({ style: S.field }, [TextInput({ label: 'Время', placeholder: 'ЧЧ:ММ', value: draft.time, onChange: v => { draft.time = v } })]),
      View({ style: S.field }, [TextInput({ label: 'Метка (утро/день/вечер)', placeholder: 'Метка', value: draft.label, onChange: v => { draft.label = v } })]),
      View({ style: S.field }, [Toggle({ label: 'Каждый день', value: everyDay, onChange: v => { draft.weekDays = v ? null : [] } })]),
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
          },
        }),
      ]),
      Button({
        label: 'Сохранить',
        color: 'primary',
        style: S.btn,
        onClick: () => {
          if (!draft.time || !draft.medicationId) return
          const schedule = this.getSchedule()
          if (isNew) {
            draft.id = generateId()
            schedule.push(draft)
          } else {
            const idx = schedule.findIndex(s => s.id === draft.id)
            if (idx >= 0) schedule[idx] = draft
          }
          this.setSchedule(schedule)
          this.navigateTo('schedule')
        },
      }),
      !isNew && Button({
        label: 'Удалить',
        color: 'default',
        style: S.btn,
        onClick: () => {
          const schedule = this.getSchedule().filter(s => s.id !== draft.id)
          this.setSchedule(schedule)
          this.navigateTo('schedule')
        },
      }),
      Button({ label: 'Назад', color: 'default', style: S.btn, onClick: () => this.navigateTo('schedule') }),
    ])
  },

  // ── History Page ──

  renderHistory() {
    const dateStr = this.state.viewHistoryDate || todayDateStr()
    const records = this.getHistoryForDate(dateStr)
    const medications = this.getMedications()

    const rows = []
    for (const rec of records) {
      const med = medications.find(m => m.id === rec.medicationId)
      const medName = med ? med.name : (rec.medicationId || '')
      const statusText = rec.status === 'taken'
        ? 'Принято в ' + (rec.takenTime || rec.scheduledTime)
        : (rec.status === 'cancelled' ? 'Отменено' : rec.status)
      rows.push(View({ style: S.row }, [Text({ style: S.rowTitle }, [medName + ' — ' + statusText])]))
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
        TextInput({ label: 'Интервал повтора (мин)', value: String(draft.retryInterval), onChange: v => { draft.retryInterval = parseInt(v, 10) || 60 } }),
      ]),
      View({ style: S.field }, [
        TextInput({ label: 'Интервал синхронизации (мин)', value: String(draft.syncInterval), onChange: v => { draft.syncInterval = parseInt(v, 10) || 60 } }),
      ]),
      View({ style: S.field }, [
        TextInput({
          label: 'Варианты отложки (мин, через запятую)',
          value: draft.snoozeOptions.join(', '),
          onChange: v => { draft.snoozeOptions = v.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)) },
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
