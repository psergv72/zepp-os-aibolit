import { log as Logger } from '@zos/utils'
import { createWidget, deleteWidget, widget, event, align, text_style } from '@zos/ui'
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
import { getIntakeEntries, isIntakeOnDay, getIntakeStatus, getTakenTime } from '../../utils/intake-logic.js'
import { fetchConfigFromSide } from '../../utils/watch-config'
import { sysText, getUiScale } from '../../utils/ui-scale'
import { createViewManager } from '../../utils/view-manager'

const logger = Logger.getLogger('aibolit-plan')

Page({
  state: {
    intakes: [],
  },

  build() {
    logger.log('plan page build')
    this.refreshView()
    this.pullConfig()
  },

  pullConfig() {
    fetchConfigFromSide().then((config) => {
      if (config) this.refreshView()
    })
  },

  onInit() {
    logger.log('plan page onInit')
  },

  onDestroy() {
    logger.log('plan page onDestroy')
  },

  refreshView() {
    if (!this.ui) this.ui = createViewManager(createWidget, deleteWidget)
    const medications = getMedications()
    const intakes = getIntakes()
    const takeLogs = getTakeLogs()
    const cancellations = getCancellations()
    const todayDateStr = getTodayDateStr()

    const dayOfWeek = new Date().getDay() === 0 ? 7 : new Date().getDay()

    const today = getIntakeEntries(intakes, medications)
      .filter(({ intake }) => isIntakeOnDay(intake, dayOfWeek))
      .sort((a, b) => a.intake.time.localeCompare(b.intake.time))

    for (const entry of today) {
      const intake = entry.intake
      const status = getIntakeStatus(intake.id, todayDateStr, takeLogs, cancellations)

      entry._taken = status === 'taken'
      entry._takenTime = getTakenTime(intake.id, todayDateStr, takeLogs)
      entry._cancelled = status === 'cancelled'
    }

    this.state.intakes = today
    this.renderPlan(today)
  },

  renderPlan(entries) {
    this.ui.clear()
    const screenWidth = 480
    const S = getUiScale()
    const btnHeight = 48 * S
    const btnY = 380 * S
    let y = 20 * S

    this.ui.create(widget.TEXT, {
      x: 0,
      y: y,
      w: screenWidth,
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
        x: 0,
        y: y,
        w: screenWidth,
        h: 36 * S,
        color: 0x888888,
        text_size: sysText(26),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: 'Нет приёмов на сегодня',
      })
    }

    for (const entry of entries) {
      const blockH = (48 + entry.items.length * 40 + (entry._takenTime ? 32 : 0) + (entry._cancelled ? 32 : 0) + 15) * S
      if (y + blockH > btnY - 5) break

      const intake = entry.intake
      const textColor = entry._cancelled ? 0x666666 : (entry._taken ? 0x4caf50 : 0xffffff)
      const headerDecor = entry._cancelled ? text_style.STRIKETHROUGH : text_style.NONE
      const statusIcon = entry._taken ? ' \u2713' : ''
      const headerText = '───── ' + intake.time + ' ────' + statusIcon

      this.ui.create(widget.TEXT, {
        x: 20,
        y: y,
        w: screenWidth - 40,
        h: 44 * S,
        color: textColor,
        text_size: sysText(26),
        align_h: align.LEFT,
        align_v: align.CENTER_V,
        text_style: headerDecor,
        text: headerText,
      })
      y += 44 * S

      for (const item of entry.items) {
        const medColor = entry._cancelled ? 0x555555 : (entry._taken ? 0x888888 : 0xffffff)
        const medDecor = entry._cancelled ? text_style.STRIKETHROUGH : text_style.NONE
        const checkMark = entry._taken ? '\u2713 ' : '  '
        this.ui.create(widget.TEXT, {
          x: 40,
          y: y,
          w: screenWidth - 80,
          h: 40 * S,
          color: medColor,
          text_size: sysText(24),
          align_h: align.LEFT,
          align_v: align.CENTER_V,
          text_style: medDecor,
          text: checkMark + item.med.name + ' \u00d7 ' + (item.amount || ''),
        })
        y += 40 * S
      }

      if (entry._taken && entry._takenTime) {
        this.ui.create(widget.TEXT, {
          x: 40,
          y: y,
          w: screenWidth - 80,
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
          x: 40,
          y: y,
          w: screenWidth - 80,
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

      const indicatorX = screenWidth - 50
      const medAreaH = (entry.items.length * 40 + (entry._takenTime ? 32 : 0)) * S
      const indicatorY = y - medAreaH - 5 * S
      const indicatorH = medAreaH + 10 * S

      if (!entry._cancelled && !entry._taken) {
        const checkBtn = this.ui.create(widget.TEXT, {
          x: indicatorX,
          y: indicatorY,
          w: 40,
          h: indicatorH,
          color: 0xffffff,
          text_size: sysText(36),
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: '\u2610',
        })
        checkBtn.addEventListener(event.CLICK_UP, () => {
          this.takeIntake(intake)
        })
        checkBtn.addEventListener(event.CLICK_DOWN, () => {
          this._pressTimer = setTimeout(() => {
            this.cancelIntake(intake)
          }, 1000)
        })
      }

      if (entry._taken) {
        const undoBtn = this.ui.create(widget.TEXT, {
          x: indicatorX,
          y: indicatorY,
          w: 40,
          h: indicatorH,
          color: 0x4caf50,
          text_size: sysText(36),
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: '\u2713',
        })
        undoBtn.addEventListener(event.CLICK_UP, () => {
          this.undoIntake(intake)
        })
      }

      y += 15 * S
    }

    const backBtn = this.ui.create(widget.TEXT, {
      x: 0,
      y: btnY,
      w: screenWidth,
      h: btnHeight,
      color: 0x888888,
      text_size: sysText(26),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: '[На главную]',
    })
    backBtn.addEventListener(event.CLICK_UP, () => {
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
