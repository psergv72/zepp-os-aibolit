import { log as Logger } from '@zos/utils'
import { createWidget, widget, align, text_style } from '@zos/ui'
import { push as routerPush } from '@zos/router'
import { getMedications, getSchedule, getIntakes, getCancellations, addIntake, getTodayDateStr } from '../../utils/storage'
import { sendIntakeToPhone } from '../../utils/sync'

const logger = Logger.getLogger('aibolit-home')

Page({
  state: {
    slots: [],
  },

  build() {
    logger.log('home page build')
    this.refreshView()
  },

  onInit() {
    logger.log('home page onInit')
  },

  onDestroy() {
    logger.log('home page onDestroy')
  },

  refreshView() {
    const medications = getMedications()
    const schedule = getSchedule()
    const intakes = getIntakes()
    const cancellations = getCancellations()
    const todayDateStr = getTodayDateStr()
    const currentTime = new Date()
    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()

    const enabledMeds = medications.filter(m => m.enabled)
    const medMap = {}
    for (const med of enabledMeds) {
      medMap[med.id] = med
    }

    const relevantSlots = schedule
      .filter(s => medMap[s.medicationId])
      .filter(s => {
        const [h, m] = s.time.split(':').map(Number)
        const slotMinutes = h * 60 + m
        return slotMinutes >= currentMinutes
      })
      .filter(s => {
        const dayOfWeek = currentTime.getDay() === 0 ? 7 : currentTime.getDay()
        if (s.weekDays && s.weekDays.length > 0 && !s.weekDays.includes(dayOfWeek)) return false
        return true
      })
      .filter(s => {
        const taken = intakes.some(i => i.scheduleId === s.id && i.date === todayDateStr && i.status === 'taken')
        return !taken
      })
      .filter(s => {
        return !cancellations.some(c => c.scheduleId === s.id && c.date === todayDateStr)
      })

    const grouped = {}
    for (const slot of relevantSlots) {
      if (!grouped[slot.id]) {
        grouped[slot.id] = { id: slot.id, time: slot.time, medicationId: slot.medicationId, weekDays: slot.weekDays, label: slot.label, medications: [] }
      }
      grouped[slot.id].medications.push(medMap[slot.medicationId])
    }

    const sortedSlots = Object.values(grouped).sort((a, b) => {
      return a.time.localeCompare(b.time)
    })

    this.state.slots = sortedSlots
    this.renderUpcoming(sortedSlots)
  },

  renderUpcoming(slots) {
    const screenWidth = 480
    let y = 20

    createWidget(widget.TEXT, {
      x: 0,
      y: y,
      w: screenWidth,
      h: 36,
      color: 0xffffff,
      text_size: 20,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'Ближайшие приёмы',
    })
    y += 50

    if (slots.length === 0) {
      createWidget(widget.TEXT, {
        x: 0,
        y: y,
        w: screenWidth,
        h: 36,
        color: 0x888888,
        text_size: 16,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: 'Нет предстоящих приёмов',
      })
      return
    }

    for (const slot of slots) {
      if (y > 440) break

      createWidget(widget.TEXT, {
        x: 20,
        y: y,
        w: screenWidth - 60,
        h: 30,
        color: 0x4fc3f7,
        text_size: 16,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: '───── ' + slot.time + ' ────',
      })
      y += 35

      for (const med of slot.medications) {
        createWidget(widget.TEXT, {
          x: 40,
          y: y,
          w: screenWidth - 90,
          h: 28,
          color: 0xffffff,
          text_size: 15,
          align_h: align.LEFT,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: med.name + ' ' + med.dosage,
        })
        y += 30
      }

      const checkboxX = screenWidth - 50
      const checkboxY = y - (slot.medications.length * 30) - 5
      const checkboxH = slot.medications.length * 30 + 10

      const takeAllBtn = createWidget(widget.TEXT, {
        x: checkboxX,
        y: checkboxY,
        w: 40,
        h: checkboxH,
        color: 0x4fc3f7,
        text_size: 22,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: '\u2610',
      })
      takeAllBtn.addEventListener(widget.CLICK_EVENT, () => {
        this.takeSlot(slot)
      })

      y += 10
    }

    const planBtnY = y + 10
    const planBtn = createWidget(widget.TEXT, {
      x: 0,
      y: planBtnY,
      w: screenWidth,
      h: 36,
      color: 0x888888,
      text_size: 16,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: '[Полный план \u2192]',
    })
    planBtn.addEventListener(widget.CLICK_EVENT, () => {
      routerPush({ url: 'page/plan/index' })
    })
  },

  takeSlot(slot) {
    const todayDateStr = getTodayDateStr()
    const now = new Date()
    const takenTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

    for (const med of slot.medications) {
      const intake = {
        id: 'intake_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        medicationId: med.id,
        scheduleId: slot.id,
        date: todayDateStr,
        scheduledTime: slot.time,
        takenTime: takenTime,
        status: 'taken',
      }
      addIntake(intake)
      sendIntakeToPhone(intake)
    }

    this.refreshView()
  },
})
