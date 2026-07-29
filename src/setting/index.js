import { log as Logger } from '@zos/utils'

const logger = Logger.getLogger('aibolit-setting')

const STORAGE_KEYS = {
  medications: 'medications',
  schedule: 'schedule',
  settings: 'settings',
}

function getItem(key, defaultValue) {
  const val = settings.settingsStorage.getItem(key)
  return val !== null && val !== undefined ? JSON.parse(val) : defaultValue
}

function setItem(key, value) {
  settings.settingsStorage.setItem(key, JSON.stringify(value))
}

function getMedications() {
  return getItem(STORAGE_KEYS.medications, [])
}

function setMedications(meds) {
  setItem(STORAGE_KEYS.medications, meds)
}

function getSchedule() {
  return getItem(STORAGE_KEYS.schedule, [])
}

function setSchedule(sched) {
  setItem(STORAGE_KEYS.schedule, sched)
}

function getAppSettings() {
  return getItem(STORAGE_KEYS.settings, { retryInterval: 60, syncInterval: 60, snoozeOptions: [30, 45, 60, 90] })
}

function setAppSettings(s) {
  setItem(STORAGE_KEYS.settings, s)
}

let currentPage = 'list'
let editingMedication = null
let editingSlot = null
let viewHistoryDate = null

function getHistoryForDate(dateStr) {
  const data = settings.settingsStorage.getItem('history_' + dateStr)
  return data ? JSON.parse(data) : []
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function navigateTo(page, params) {
  currentPage = page
  if (params) {
    if (params.medication !== undefined) editingMedication = params.medication
    if (params.slot !== undefined) editingSlot = params.slot
    if (params.date !== undefined) viewHistoryDate = params.date
  }
  build()
}

function getText(key) {
  return key
}

function createElement(tag, attrs, children) {
  const el = document.createElement(tag)
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') { el.className = v }
      else if (k === 'onClick') { el.addEventListener('click', v) }
      else if (k === 'onInput') { el.addEventListener('input', v) }
      else if (k === 'onChange') { el.addEventListener('change', v) }
      else if (k === 'textContent') { el.textContent = v }
      else { el.setAttribute(k, v) }
    }
  }
  if (children) {
    for (const child of children) {
      if (typeof child === 'string') { el.appendChild(document.createTextNode(child)) }
      else { el.appendChild(child) }
    }
  }
  return el
}

function clearBody() {
  document.body.innerHTML = ''
}

// ── Medication List Page ──

function renderMedicationList() {
  clearBody()
  const medications = getMedications()
  const schedule = getSchedule()

  const container = createElement('div', { className: 'page' })
  container.appendChild(createElement('h1', { textContent: 'Лекарства' }))

  for (const med of medications) {
    const slotCount = schedule.filter(s => s.medicationId === med.id).length
    const row = createElement('div', {
      className: 'list-item',
      onClick: () => navigateTo('edit', { medication: med }),
    })
    const nameEl = createElement('span', { textContent: med.name + ' (' + med.dosage + ')' + (!med.enabled ? ' [OFF]' : '') })
    const subEl = createElement('small', { textContent: slotCount + ' приемов' })
    row.appendChild(nameEl)
    row.appendChild(createElement('br'))
    row.appendChild(subEl)
    container.appendChild(row)
  }

  const addBtn = createElement('button', { textContent: '+ Добавить', onClick: () => navigateTo('edit', { medication: null }) })
  container.appendChild(addBtn)

  const histBtn = createElement('button', { textContent: 'История', onClick: () => navigateTo('history') })
  container.appendChild(histBtn)

  const settBtn = createElement('button', { textContent: 'Настройки', onClick: () => navigateTo('settings') })
  container.appendChild(settBtn)

  document.body.appendChild(container)
}

// ── Medication Edit Page ──

function renderMedicationEdit() {
  clearBody()
  const isNew = !editingMedication
  const med = isNew ? { name: '', dosage: '', comments: '', enabled: true } : { ...editingMedication }

  const container = createElement('div', { className: 'page' })
  container.appendChild(createElement('h1', { textContent: isNew ? 'Добавить лекарство' : 'Редактировать лекарство' }))

  const nameInput = createElement('input', { type: 'text', placeholder: 'Название', value: med.name, onInput: (e) => { med.name = e.target.value } })
  container.appendChild(createElement('label', { textContent: 'Название' }))
  container.appendChild(nameInput)

  const dosageInput = createElement('input', { type: 'text', placeholder: 'Дозировка', value: med.dosage, onInput: (e) => { med.dosage = e.target.value } })
  container.appendChild(createElement('label', { textContent: 'Дозировка' }))
  container.appendChild(dosageInput)

  const commentsInput = createElement('input', { type: 'text', placeholder: 'Комментарии', value: med.comments, onInput: (e) => { med.comments = e.target.value } })
  container.appendChild(createElement('label', { textContent: 'Комментарии' }))
  container.appendChild(commentsInput)

  const enabledCheck = createElement('input', { type: 'checkbox', checked: med.enabled, onChange: (e) => { med.enabled = e.target.checked } })
  container.appendChild(createElement('label', { textContent: 'Активно' }))
  container.appendChild(enabledCheck)
  container.appendChild(createElement('br'))

  const saveBtn = createElement('button', {
    textContent: 'Сохранить',
    onClick: () => {
      if (!med.name.trim()) return
      const medications = getMedications()
      if (isNew) {
        med.id = generateId()
        medications.push(med)
      } else {
        const idx = medications.findIndex(m => m.id === med.id)
        if (idx >= 0) medications[idx] = med
      }
      setMedications(medications)
      navigateTo('list')
    },
  })
  container.appendChild(saveBtn)

  const scheduleBtn = createElement('button', {
    textContent: 'Расписание',
    onClick: () => navigateTo('schedule', { medication: editingMedication || med }),
  })
  container.appendChild(scheduleBtn)

  const backBtn = createElement('button', { textContent: 'Назад', onClick: () => navigateTo('list') })
  container.appendChild(backBtn)

  document.body.appendChild(container)
}

// ── Schedule List Page ──

const DAY_SHORT = { 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 7: 'Вс' }

function renderScheduleList() {
  clearBody()
  const schedule = getSchedule()
  const medicationId = editingMedication ? editingMedication.id : null
  const slots = schedule.filter(s => s.medicationId === medicationId)

  const container = createElement('div', { className: 'page' })
  container.appendChild(createElement('h1', { textContent: 'Расписание' }))

  for (const slot of slots) {
    const daysText = slot.weekDays && slot.weekDays.length ? slot.weekDays.map(d => DAY_SHORT[d] || d).join(', ') : 'Каждый день'
    const row = createElement('div', {
      className: 'list-item',
      onClick: () => navigateTo('slotEdit', { slot: slot }),
    })
    row.appendChild(createElement('span', { textContent: (slot.label || slot.time) + ' — ' + slot.time }))
    row.appendChild(createElement('br'))
    row.appendChild(createElement('small', { textContent: daysText }))
    container.appendChild(row)
  }

  const addBtn = createElement('button', { textContent: '+ Добавить время', onClick: () => navigateTo('slotEdit', { slot: null }) })
  container.appendChild(addBtn)

  const backBtn = createElement('button', { textContent: 'Назад', onClick: () => navigateTo('edit', { medication: editingMedication }) })
  container.appendChild(backBtn)

  document.body.appendChild(container)
}

// ── Slot Edit Page ──

function renderSlotEdit() {
  clearBody()
  const isNew = !editingSlot
  const slot = isNew ? { medicationId: editingMedication ? editingMedication.id : null, time: '08:00', weekDays: null, label: '' } : { ...editingSlot }

  const container = createElement('div', { className: 'page' })
  container.appendChild(createElement('h1', { textContent: isNew ? 'Добавить время' : 'Редактировать время' }))

  const timeInput = createElement('input', { type: 'text', placeholder: 'ЧЧ:ММ', value: slot.time, onInput: (e) => { slot.time = e.target.value } })
  container.appendChild(createElement('label', { textContent: 'Время' }))
  container.appendChild(timeInput)

  const labelInput = createElement('input', { type: 'text', placeholder: 'Метка (утро/день/вечер)', value: slot.label, onInput: (e) => { slot.label = e.target.value } })
  container.appendChild(createElement('label', { textContent: 'Метка' }))
  container.appendChild(labelInput)

  container.appendChild(createElement('br'))
  const allDaysCheck = createElement('input', {
    type: 'checkbox',
    checked: !slot.weekDays || slot.weekDays.length === 0,
    onChange: (e) => { slot.weekDays = e.target.checked ? null : [] }
  })
  container.appendChild(createElement('label', { textContent: 'Каждый день' }))
  container.appendChild(allDaysCheck)
  container.appendChild(createElement('br'))

  const saveBtn = createElement('button', {
    textContent: 'Сохранить',
    onClick: () => {
      if (!slot.time || !slot.medicationId) return
      const schedule = getSchedule()
      if (isNew) {
        slot.id = generateId()
        schedule.push(slot)
      } else {
        const idx = schedule.findIndex(s => s.id === slot.id)
        if (idx >= 0) schedule[idx] = slot
      }
      setSchedule(schedule)
      editingSlot = null
      navigateTo('schedule', { medication: editingMedication })
    },
  })
  container.appendChild(saveBtn)

  if (!isNew) {
    const deleteBtn = createElement('button', {
      textContent: 'Удалить',
      onClick: () => {
        const schedule = getSchedule()
        const filtered = schedule.filter(s => s.id !== slot.id)
        setSchedule(filtered)
        editingSlot = null
        navigateTo('schedule', { medication: editingMedication })
      },
    })
    container.appendChild(deleteBtn)
  }

  const backBtn = createElement('button', { textContent: 'Назад', onClick: () => { editingSlot = null; navigateTo('schedule', { medication: editingMedication }) } })
  container.appendChild(backBtn)

  document.body.appendChild(container)
}

// ── History Page ──

function renderHistory() {
  clearBody()
  const today = new Date()
  const dateStr = viewHistoryDate || today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')

  const records = getHistoryForDate(dateStr)
  const medications = getMedications()

  const container = createElement('div', { className: 'page' })
  container.appendChild(createElement('h1', { textContent: 'История' }))

  const dateInput = createElement('input', {
    type: 'text',
    value: dateStr,
    onInput: (e) => { viewHistoryDate = e.target.value; renderHistory() }
  })
  container.appendChild(createElement('label', { textContent: 'Дата (ГГГГ-ММ-ДД)' }))
  container.appendChild(dateInput)

  if (records.length === 0) {
    container.appendChild(createElement('p', { textContent: 'Нет данных за эту дату' }))
  } else {
    for (const rec of records) {
      const med = medications.find(m => m.id === rec.medicationId)
      const medName = med ? med.name : (rec.medicationId || '')
      const statusText = rec.status === 'taken' ? 'Принято в ' + (rec.takenTime || rec.scheduledTime) : (rec.status === 'cancelled' ? 'Отменено' : rec.status)
      const row = createElement('div', { className: 'list-item' })
      row.appendChild(createElement('span', { textContent: medName + ' — ' + statusText }))
      container.appendChild(row)
    }
  }

  const backBtn = createElement('button', { textContent: 'Назад', onClick: () => { viewHistoryDate = null; navigateTo('list') } })
  container.appendChild(backBtn)

  document.body.appendChild(container)
}

// ── Settings Page ──

function renderSettingsPage() {
  clearBody()
  const appSettings = getAppSettings()

  const container = createElement('div', { className: 'page' })
  container.appendChild(createElement('h1', { textContent: 'Настройки' }))

  const retryInput = createElement('input', {
    type: 'number',
    value: String(appSettings.retryInterval),
    onInput: (e) => { appSettings.retryInterval = parseInt(e.target.value, 10) || 60 }
  })
  container.appendChild(createElement('label', { textContent: 'Интервал повтора (мин)' }))
  container.appendChild(retryInput)

  const syncInput = createElement('input', {
    type: 'number',
    value: String(appSettings.syncInterval),
    onInput: (e) => { appSettings.syncInterval = parseInt(e.target.value, 10) || 60 }
  })
  container.appendChild(createElement('label', { textContent: 'Интервал синхронизации (мин)' }))
  container.appendChild(syncInput)

  const snoozeInput = createElement('input', {
    type: 'text',
    value: appSettings.snoozeOptions.join(', '),
    onInput: (e) => { appSettings.snoozeOptions = e.target.value.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n)) }
  })
  container.appendChild(createElement('label', { textContent: 'Варианты отложки (мин, через запятую)' }))
  container.appendChild(snoozeInput)

  const saveBtn = createElement('button', {
    textContent: 'Сохранить',
    onClick: () => {
      setAppSettings(appSettings)
      navigateTo('list')
    },
  })
  container.appendChild(saveBtn)

  const backBtn = createElement('button', { textContent: 'Назад', onClick: () => navigateTo('list') })
  container.appendChild(backBtn)

  document.body.appendChild(container)
}

function build() {
  switch (currentPage) {
    case 'list': renderMedicationList(); break
    case 'edit': renderMedicationEdit(); break
    case 'schedule': renderScheduleList(); break
    case 'slotEdit': renderSlotEdit(); break
    case 'history': renderHistory(); break
    case 'settings': renderSettingsPage(); break
  }
}

Page({ build })
