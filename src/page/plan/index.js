import { log as Logger } from '@zos/utils'
import { createWidget, deleteWidget, widget, event, align, text_style, redraw } from '@zos/ui'
import { replace as routerReplace } from '@zos/router'
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
import { getIntakeEntries, isIntakeOnDay, getIntakeStatus, getTakenTime, medItemText } from '../../utils/intake-logic.js'
import { fetchConfigFromSide } from '../../utils/watch-config'
import { sysText, getUiScale } from '../../utils/ui-scale'
import { getContentBounds, renderTimeHeader, renderNavButton, enableScroll } from '../../utils/screen-layout'
import { createViewManager } from '../../utils/view-manager'
import { wrapText } from '../../utils/text-wrap'

const logger = Logger.getLogger('aibolit-plan')

Page({
  state: {
    intakes: [],
  },

  build() {
    logger.log('plan page build')
    this._destroyed = false
    this.refreshView()
    this.pullConfig()
  },

  pullConfig() {
    fetchConfigFromSide().then((config) => {
      if (config && !this._destroyed) this.refreshView()
    })
  },

  onInit() {
    logger.log('plan page onInit')
  },

  onDestroy() {
    logger.log('plan page onDestroy')
    this._destroyed = true
    if (this.ui) this.ui.clear()
  },

  refreshView() {
    if (this._destroyed) return
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
    const S = getUiScale()
    const bounds = getContentBounds()
    const headerH = 40 * S
    const headerGap = 10 * S
    const btnGap = 24 * S
    const btnH = 48 * S
    const bottomPad = 48 * S
    const checkColW = 40 * S
    const checkGap = 4 * S
    const medX = bounds.left + checkColW + checkGap
    const medW = bounds.right - medX
    const lineHSp = 28
    const medGapSp = 40
    const lineH = lineHSp * S
    const medGap = medGapSp * S
    const medSize = sysText(24)
    const linesOf = (item) => wrapText(medItemText(item), medSize, medW)
    const itemsOf = (entry) => entry.items || []
    const statusHOf = (entry) => (entry._takenTime ? 32 : 0) + (entry._cancelled ? 32 : 0)
    const blockHOf = (entry) => {
      const items = itemsOf(entry)
      const totalLines = items.reduce((sum, it) => sum + linesOf(it).length, 0)
      const medSection = (totalLines - items.length) * lineHSp + items.length * medGapSp
      return (44 + medSection + statusHOf(entry) + 15) * S
    }

    let totalH = bounds.top + headerH + headerGap + btnGap + btnH + bottomPad
    if (entries.length === 0) {
      totalH += (36 + 10) * S
    } else {
      for (const entry of entries) totalH += blockHOf(entry)
    }
    enableScroll(totalH)

    let y = bounds.top

    this.ui.create(widget.TEXT, {
      x: bounds.left,
      y: y,
      w: bounds.width,
      h: headerH,
      color: 0xffffff,
      text_size: sysText(32),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'План на сегодня',
    })
    y += headerH + headerGap

    if (entries.length === 0) {
      this.ui.create(widget.TEXT, {
        x: bounds.left,
        y: y,
        w: bounds.width,
        h: 36 * S,
        color: 0x888888,
        text_size: sysText(26),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: 'Нет приёмов на сегодня',
      })
      y += (36 + 10) * S
    }

    for (const entry of entries) {
      const items = itemsOf(entry)
      const intake = entry.intake
      const textColor = entry._cancelled ? 0x666666 : (entry._taken ? 0x4caf50 : 0xffffff)
      const statusIcon = entry._taken ? ' \u2713' : ''
      const headerText = intake.time + statusIcon

      renderTimeHeader(this.ui, {
        text: headerText,
        x: bounds.left,
        y: y,
        right: bounds.right,
        color: textColor,
        sizeSp: 26,
        rowH: 44 * S,
        textStyle: entry._cancelled ? text_style.STRIKETHROUGH : text_style.NONE,
      })
      y += 44 * S

      const firstMedY = y

      for (const item of items) {
        const medColor = entry._cancelled ? 0x555555 : (entry._taken ? 0x888888 : 0xffffff)
        const medDecor = entry._cancelled ? text_style.STRIKETHROUGH : text_style.NONE
        const lines = linesOf(item)
        for (let i = 0; i < lines.length; i++) {
          this.ui.create(widget.TEXT, {
            x: medX,
            y: y + i * lineH,
            w: medW,
            h: lineH,
            color: medColor,
            text_size: medSize,
            align_h: align.LEFT,
            align_v: align.CENTER_V,
            text_style: medDecor,
            text: lines[i],
          })
        }
        y += (lines.length - 1) * lineH + medGap
      }

      if (entry._taken && entry._takenTime) {
        this.ui.create(widget.TEXT, {
          x: medX,
          y: y,
          w: medW,
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
          x: medX,
          y: y,
          w: medW,
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

      if (!entry._cancelled) {
        const symbol = entry._taken ? '\u2713' : '\u2610'
        const color = entry._taken ? 0x4caf50 : 0xffffff
        const ctrl = this.ui.create(widget.TEXT, {
          x: bounds.left,
          y: firstMedY + (lineH - medGap) / 2,
          w: checkColW,
          h: medGap,
          color: color,
          text_size: sysText(36),
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: symbol,
        })
        ctrl.addEventListener(event.CLICK_UP, () => {
          if (entry._taken) {
            this.undoIntake(intake)
          } else {
            this.takeIntake(intake)
          }
        })
        if (!entry._taken) {
          ctrl.addEventListener(event.CLICK_DOWN, () => {
            this._pressTimer = setTimeout(() => {
              this.cancelIntake(intake)
            }, 1000)
          })
        }
      }

      y += 15 * S
    }

    y += btnGap

    const backBtn = renderNavButton(this.ui, {
      x: bounds.left,
      y: y,
      w: bounds.width,
      h: btnH,
      text: 'На главную',
    })
    backBtn.addEventListener(event.CLICK_UP, () => {
      routerReplace({ url: 'page/home/index' })
    })

    this.ui.create(widget.FILL_RECT, {
      x: bounds.left,
      y: y + btnH,
      w: bounds.width,
      h: bottomPad,
      color: 0x000000,
    })

    redraw()
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
