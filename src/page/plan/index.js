import { log as Logger } from '@zos/utils'
import { createWidget, widget, align, text_style } from '@zos/ui'
import { push as routerPush } from '@zos/router'
import {
  getMedications,
  getIntakes,
  getTakeLogs,
  getCancellations,
  addCancellation,
  removeCancellation,
  getTodayDateStr,
  addTakeLog,
  removeTakeLog,
} from '../../utils/storage'
import { sendTakeLogToPhone, sendCancellationToPhone } from '../../utils/sync'

const logger = Logger.getLogger('aibolit-plan')

Page({
  state: {
    intakes: [],
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
    const intakes = getIntakes()
    const takeLogs = getTakeLogs()
    const cancellations = getCancellations()
    const todayDateStr = getTodayDateStr()

    const enabledMedMap = {}
    for (const med of medications) {
      if (med.enabled) enabledMedMap[med.id] = med
    }

    const dayOfWeek = new Date().getDay() === 0 ? 7 : new Date().getDay()

    const today = intakes
      .map(intake => ({
        intake,
        items: (intake.items || [])
          .map(item => ({ med: enabledMedMap[item.medicationId], amount: item.amount }))
          .filter(({ med }) => med),
      }))
      .filter(({ items }) => items.length > 0)
      .filter(({ intake }) => {
        if (intake.weekDays && intake.weekDays.length > 0 && !intake.weekDays.includes(dayOfWeek)) return false
        return true
      })
      .sort((a, b) => a.intake.time.localeCompare(b.intake.time))

    for (const entry of today) {
      const intake = entry.intake
      const intakeLogs = takeLogs.filter(i => i.intakeId === intake.id && i.date === todayDateStr)
      const takenLog = intakeLogs.find(i => i.status === 'taken')
      const isCancelled = cancellations.some(c => c.intakeId === intake.id && c.date === todayDateStr)

      entry._taken = !!takenLog
      entry._takenTime = takenLog ? takenLog.takenTime : null
      entry._cancelled = isCancelled
    }

    this.state.intakes = today
    this.renderPlan(today)
  },

  renderPlan(entries) {
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

    if (entries.length === 0) {
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

    for (const entry of entries) {
      if (y > 440) break

      const intake = entry.intake
      const textColor = entry._cancelled ? 0x666666 : (entry._taken ? 0x4caf50 : 0xffffff)
      const headerDecor = entry._cancelled ? text_style.STRIKETHROUGH : text_style.NONE
      const statusIcon = entry._taken ? ' \u2713' : ''
      const headerText = '───── ' + intake.time + ' ────' + statusIcon

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

      for (const item of entry.items) {
        const medColor = entry._cancelled ? 0x555555 : (entry._taken ? 0x888888 : 0xffffff)
        const medDecor = entry._cancelled ? text_style.STRIKETHROUGH : text_style.NONE
        const checkMark = entry._taken ? '\u2713 ' : '  '
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
          text: checkMark + item.med.name + ' \u00d7 ' + (item.amount || ''),
        })
        y += 28
      }

      if (entry._taken && entry._takenTime) {
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
          text: 'приняты в ' + entry._takenTime,
        })
        y += 25
      }

      if (entry._cancelled) {
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
          this.restoreIntake(intake)
        })
        y += 25
      }

      const indicatorX = screenWidth - 50
      const medAreaH = entry.items.length * 28 + (entry._takenTime ? 25 : 0)
      const indicatorY = y - medAreaH - 5
      const indicatorH = medAreaH + 10

      if (!entry._cancelled && !entry._taken) {
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
          this.takeIntake(intake)
        })
        checkBtn.addEventListener(widget.LONGPRESS_EVENT, () => {
          this.cancelIntake(intake)
        })
      }

      if (entry._taken) {
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
          this.undoIntake(intake)
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

  takeIntake(intake) {
    const todayDateStr = getTodayDateStr()
    const now = new Date()
    const takenTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

    const takeLog = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      intakeId: intake.id,
      date: todayDateStr,
      time: intake.time,
      takenTime: takenTime,
      status: 'taken',
      items: (intake.items || []).map(item => ({ ...item })),
    }
    addTakeLog(takeLog)
    sendTakeLogToPhone(takeLog)

    this.refreshView()
  },

  undoIntake(intake) {
    const todayDateStr = getTodayDateStr()
    const takeLogs = getTakeLogs()
    const toRemove = takeLogs.filter(i => i.intakeId === intake.id && i.date === todayDateStr && i.status === 'taken')
    for (const takeLog of toRemove) {
      removeTakeLog(takeLog.id)
    }
    this.refreshView()
  },

  cancelIntake(intake) {
    const todayDateStr = getTodayDateStr()
    addCancellation(intake.id, todayDateStr)
    sendCancellationToPhone(intake.id, todayDateStr)
    this.refreshView()
  },

  restoreIntake(intake) {
    const todayDateStr = getTodayDateStr()
    removeCancellation(intake.id, todayDateStr)
    this.refreshView()
  },
})
