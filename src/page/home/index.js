import { log as Logger } from '@zos/utils'
import { createWidget, deleteWidget, widget, event, align, text_style, redraw } from '@zos/ui'
import { replace as routerReplace } from '@zos/router'
import { getMedications, getIntakes, getTakeLogs, getCancellations, addTakeLog, getTodayDateStr } from '../../utils/storage'
import { sendTakeLogToPhone, fetchTakesFromPhone, mergeTakeRecords } from '../../utils/sync'
import { getIntakeEntries, isIntakeOnDay, isIntakeTakenToday, isIntakeCancelledToday, isIntakeSkippedToday, medItemText, timeToMinutes, sortIntakeEntriesByTime } from '../../utils/intake-logic.js'
import { fetchConfigFromSide } from '../../utils/watch-config'
import { sysText, getUiScale } from '../../utils/ui-scale'
import { getContentBounds, renderTimeHeader, renderNavButton, enableScroll } from '../../utils/screen-layout'
import { createViewManager } from '../../utils/view-manager'
import { wrapText } from '../../utils/text-wrap'

const logger = Logger.getLogger('aibolit-home')

Page({
  state: {
    intakes: [],
  },

  build() {
    logger.log('home page build')
    this._destroyed = false
    this.refreshView()
    this.pullConfig()
    this.pullTakes()
  },

  pullConfig() {
    fetchConfigFromSide().then((config) => {
      if (config && !this._destroyed) this.refreshView()
    })
  },

  pullTakes() {
    const todayDateStr = getTodayDateStr()
    fetchTakesFromPhone(todayDateStr).then((records) => {
      if (this._destroyed) return
      if (mergeTakeRecords(records)) this.refreshView()
    })
  },

  onInit() {
    logger.log('home page onInit')
  },

  onDestroy() {
    logger.log('home page onDestroy')
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
    const currentTime = new Date()
    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()

    const dayOfWeek = currentTime.getDay() === 0 ? 7 : currentTime.getDay()

    const relevant = sortIntakeEntriesByTime(
      getIntakeEntries(intakes, medications)
        .filter(({ intake }) => timeToMinutes(intake.time) >= currentMinutes)
        .filter(({ intake }) => isIntakeOnDay(intake, dayOfWeek))
        .filter(({ intake }) => !isIntakeTakenToday(intake.id, todayDateStr, takeLogs))
        .filter(({ intake }) => !isIntakeCancelledToday(intake.id, todayDateStr, cancellations))
        .filter(({ intake }) => !isIntakeSkippedToday(intake.id, todayDateStr, takeLogs))
    )

    this.state.intakes = relevant
    this.renderUpcoming(relevant)
  },

  renderUpcoming(entries) {
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
    const blockHOf = (entry) => {
      const items = itemsOf(entry)
      const totalLines = items.reduce((sum, it) => sum + linesOf(it).length, 0)
      const medSection = (totalLines - items.length) * lineHSp + items.length * medGapSp
      return (44 + medSection + 10) * S
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
      text: 'Сегодня',
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
        text: 'Нет предстоящих приёмов',
      })
      y += (36 + 10) * S
    }

    for (const entry of entries) {
      const items = itemsOf(entry)
      const intake = entry.intake

      renderTimeHeader(this.ui, {
        text: intake.time,
        x: bounds.left,
        y: y,
        right: bounds.right,
        color: 0x4fc3f7,
        sizeSp: 26,
        rowH: 44 * S,
      })
      y += 44 * S

      const firstMedY = y

      for (const item of items) {
        const lines = linesOf(item)
        for (let i = 0; i < lines.length; i++) {
          this.ui.create(widget.TEXT, {
            x: medX,
            y: y + i * lineH,
            w: medW,
            h: lineH,
            color: 0xffffff,
            text_size: medSize,
            align_h: align.LEFT,
            align_v: align.CENTER_V,
            text_style: text_style.NONE,
            text: lines[i],
          })
        }
        y += (lines.length - 1) * lineH + medGap
      }

      const takeBtn = this.ui.create(widget.TEXT, {
        x: bounds.left,
        y: firstMedY + (lineH - medGap) / 2,
        w: checkColW,
        h: medGap,
        color: 0x4fc3f7,
        text_size: sysText(36),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: '\u2610',
      })
      takeBtn.addEventListener(event.CLICK_UP, () => {
        this.takeIntake(intake)
      })

      y += 10 * S
    }

    y += btnGap

    const planBtn = renderNavButton(this.ui, {
      x: bounds.left,
      y: y,
      w: bounds.width,
      h: btnH,
      text: 'Полный план',
    })
    planBtn.addEventListener(event.CLICK_UP, () => {
      routerReplace({ url: 'page/plan/index' })
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
})
