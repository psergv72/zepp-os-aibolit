import { log as Logger } from '@zos/utils'
import { createWidget, widget, align, text_style } from '@zos/ui'
import { push as routerPush } from '@zos/router'
import {
  getMedications,
  getSchedule,
  getIntakes,
  getCancellations,
  addCancellation,
  removeCancellation,
  getTodayDateStr,
  addIntake,
  removeIntake,
} from '../../utils/storage'
import { sendIntakeToPhone, sendCancellationToPhone } from '../../utils/sync'

const logger = Logger.getLogger('aibolit-plan')

Page({
  state: {
    slots: [],
  },

  build() {
    logger.log('plan page build')
    this.refreshView()
  },

  onInit() {
    logger.log('plan page onInit')
  },

  onDestroy() {
    logger.log('plan page onDestroy')
  },

  refreshView() {
    const medications = getMedications()
    const schedule = getSchedule()
    const intakes = getIntakes()
    const cancellations = getCancellations()
    const todayDateStr = getTodayDateStr()

    const enabledMeds = medications.filter(m => m.enabled)
    const medMap = {}
    for (const med of enabledMeds) {
      medMap[med.id] = med
    }

    const dayOfWeek = new Date().getDay() === 0 ? 7 : new Date().getDay()

    const todaySlots = schedule
      .filter(s => medMap[s.medicationId])
      .filter(s => {
        if (s.weekDays && s.weekDays.length > 0 && !s.weekDays.includes(dayOfWeek)) return false
        return true
      })

    const grouped = {}
    for (const slot of todaySlots) {
      if (!grouped[slot.id]) {
        grouped[slot.id] = { id: slot.id, time: slot.time, medicationId: slot.medicationId, weekDays: slot.weekDays, label: slot.label, medications: [] }
      }
      grouped[slot.id].medications.push(medMap[slot.medicationId])
    }

    const sortedSlots = Object.values(grouped).sort((a, b) => a.time.localeCompare(b.time))

    for (const slot of sortedSlots) {
      const slotIntakes = intakes.filter(i => i.scheduleId === slot.id && i.date === todayDateStr)
      const takenIntake = slotIntakes.find(i => i.status === 'taken')
      const isCancelled = cancellations.some(c => c.scheduleId === slot.id && c.date === todayDateStr)

      slot._taken = !!takenIntake
      slot._takenTime = takenIntake ? takenIntake.takenTime : null
      slot._cancelled = isCancelled
    }

    this.state.slots = sortedSlots
    this.renderPlan(sortedSlots)
  },

  renderPlan(slots) {
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
      text: 'План на сегодня',
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
        text: 'Нет приёмов на сегодня',
      })
      return
    }

    for (const slot of slots) {
      if (y > 440) break

      const textColor = slot._cancelled ? 0x666666 : (slot._taken ? 0x4caf50 : 0xffffff)
      const headerDecor = slot._cancelled ? text_style.STRIKETHROUGH : text_style.NONE
      const statusIcon = slot._taken ? ' \u2713' : ''
      const headerText = '───── ' + slot.time + ' ────' + statusIcon

      createWidget(widget.TEXT, {
        x: 20,
        y: y,
        w: screenWidth - 40,
        h: 30,
        color: textColor,
        text_size: 16,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
        text_style: headerDecor,
        text: headerText,
      })
      y += 35

      for (const med of slot.medications) {
        const medColor = slot._cancelled ? 0x555555 : (slot._taken ? 0x888888 : 0xffffff)
        const medDecor = slot._cancelled ? text_style.STRIKETHROUGH : text_style.NONE
        const checkMark = slot._taken ? '\u2713 ' : '  '
        createWidget(widget.TEXT, {
          x: 40,
          y: y,
          w: screenWidth - 80,
          h: 28,
          color: medColor,
          text_size: 15,
          align_h: align.LEFT,
          align_v: align.CENTER_V,
          text_style: medDecor,
          text: checkMark + med.name + ' ' + med.dosage,
        })
        y += 28
      }

      if (slot._taken && slot._takenTime) {
        createWidget(widget.TEXT, {
          x: 40,
          y: y,
          w: screenWidth - 80,
          h: 22,
          color: 0x666666,
          text_size: 13,
          align_h: align.LEFT,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: 'приняты в ' + slot._takenTime,
        })
        y += 25
      }

      if (slot._cancelled) {
        const restoreBtn = createWidget(widget.TEXT, {
          x: 40,
          y: y,
          w: screenWidth - 80,
          h: 22,
          color: 0x4fc3f7,
          text_size: 13,
          align_h: align.LEFT,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: 'вернуть прием',
        })
        restoreBtn.addEventListener(widget.CLICK_EVENT, () => {
          this.restoreSlot(slot)
        })
        y += 25
      }

      const indicatorX = screenWidth - 50
      const medAreaH = slot.medications.length * 28 + (slot._takenTime ? 25 : 0)
      const indicatorY = y - medAreaH - 5
      const indicatorH = medAreaH + 10

      if (!slot._cancelled && !slot._taken) {
        const checkBtn = createWidget(widget.TEXT, {
          x: indicatorX,
          y: indicatorY,
          w: 40,
          h: indicatorH,
          color: 0xffffff,
          text_size: 22,
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: '\u2610',
        })
        checkBtn.addEventListener(widget.CLICK_EVENT, () => {
          this.takeSlot(slot)
        })
        checkBtn.addEventListener(widget.LONGPRESS_EVENT, () => {
          this.cancelSlot(slot)
        })
      }

      if (slot._taken) {
        const undoBtn = createWidget(widget.TEXT, {
          x: indicatorX,
          y: indicatorY,
          w: 40,
          h: indicatorH,
          color: 0x4caf50,
          text_size: 22,
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: '\u2713',
        })
        undoBtn.addEventListener(widget.CLICK_EVENT, () => {
          this.undoSlot(slot)
        })
      }

      y += 15
    }

    const backBtnY = y + 10
    const backBtn = createWidget(widget.TEXT, {
      x: 0,
      y: backBtnY,
      w: screenWidth,
      h: 36,
      color: 0x888888,
      text_size: 16,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: '[На главную]',
    })
    backBtn.addEventListener(widget.CLICK_EVENT, () => {
      routerPush({ url: 'page/home/index' })
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

  undoSlot(slot) {
    const todayDateStr = getTodayDateStr()
    const intakes = getIntakes()
    const toRemove = intakes.filter(i => i.scheduleId === slot.id && i.date === todayDateStr && i.status === 'taken')
    for (const intake of toRemove) {
      removeIntake(intake.id)
    }
    this.refreshView()
  },

  cancelSlot(slot) {
    const todayDateStr = getTodayDateStr()
    addCancellation(slot.id, todayDateStr)
    sendCancellationToPhone(slot.id, todayDateStr)
    this.refreshView()
  },

  restoreSlot(slot) {
    const todayDateStr = getTodayDateStr()
    removeCancellation(slot.id, todayDateStr)
    this.refreshView()
  },
})
