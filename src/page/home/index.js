import { log as Logger } from '@zos/utils'
import { createWidget, deleteWidget, widget, event, align, text_style } from '@zos/ui'
import { replace as routerReplace } from '@zos/router'
import { getMedications, getIntakes, getTakeLogs, getCancellations, addTakeLog, getTodayDateStr } from '../../utils/storage'
import { sendTakeLogToPhone } from '../../utils/sync'
import { getIntakeEntries, isIntakeOnDay, isIntakeTakenToday, isIntakeCancelledToday } from '../../utils/intake-logic.js'
import { fetchConfigFromSide } from '../../utils/watch-config'
import { sysText, getUiScale } from '../../utils/ui-scale'
import { getContentBounds, renderTimeHeader, renderNavButton, enableScroll } from '../../utils/screen-layout'
import { createViewManager } from '../../utils/view-manager'

const logger = Logger.getLogger('aibolit-home')

Page({
  state: {
    intakes: [],
  },

  build() {
    logger.log('home page build')
    this.refreshView()
    this.pullConfig()
  },

  pullConfig() {
    fetchConfigFromSide().then((config) => {
      if (config) this.refreshView()
    })
  },

  onInit() {
    logger.log('home page onInit')
  },

  onDestroy() {
    logger.log('home page onDestroy')
  },

  refreshView() {
    if (!this.ui) this.ui = createViewManager(createWidget, deleteWidget)
    const medications = getMedications()
    const intakes = getIntakes()
    const takeLogs = getTakeLogs()
    const cancellations = getCancellations()
    const todayDateStr = getTodayDateStr()
    const currentTime = new Date()
    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes()

    const dayOfWeek = currentTime.getDay() === 0 ? 7 : currentTime.getDay()

    const relevant = getIntakeEntries(intakes, medications)
      .filter(({ intake }) => {
        const [h, m] = intake.time.split(':').map(Number)
        const intakeMinutes = h * 60 + m
        return intakeMinutes >= currentMinutes
      })
      .filter(({ intake }) => isIntakeOnDay(intake, dayOfWeek))
      .filter(({ intake }) => !isIntakeTakenToday(intake.id, todayDateStr, takeLogs))
      .filter(({ intake }) => !isIntakeCancelledToday(intake.id, todayDateStr, cancellations))
      .sort((a, b) => a.intake.time.localeCompare(b.intake.time))

    this.state.intakes = relevant
    this.renderUpcoming(relevant)
  },

  renderUpcoming(entries) {
    this.ui.clear()
    const S = getUiScale()
    const bounds = getContentBounds()
    const headerH = 48 * S
    const headerGap = 28 * S
    const btnH = 48 * S
    const bottomPad = 80 * S
    const checkColW = 40 * S
    const checkGap = 16 * S
    const itemsOf = (entry) => entry.items || []
    const blockHOf = (entry) => (44 + itemsOf(entry).length * 40 + 10) * S

    let totalH = bounds.top + headerH + headerGap + btnH + bottomPad
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
      text: 'Ближайшие приёмы',
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

      const medX = bounds.left + checkColW + checkGap
      const medW = bounds.right - medX
      const firstMedY = y

      for (const item of items) {
        this.ui.create(widget.TEXT, {
          x: medX,
          y: y,
          w: medW,
          h: 40 * S,
          color: 0xffffff,
          text_size: sysText(24),
          align_h: align.LEFT,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: item.med.name + ' \u00d7 ' + (item.amount || ''),
        })
        y += 40 * S
      }

      const takeBtn = this.ui.create(widget.TEXT, {
        x: bounds.left,
        y: firstMedY,
        w: checkColW,
        h: 40 * S,
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

    const planBtn = renderNavButton(this.ui, {
      x: bounds.left,
      y: y,
      w: bounds.width,
      h: btnH,
      text: '[Полный план \u2192]',
    })
    planBtn.addEventListener(event.CLICK_UP, () => {
      routerReplace({ url: 'page/plan/index' })
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
})
