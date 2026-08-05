import { log as Logger } from '@zos/utils'
import { createWidget, deleteWidget, widget, event, align, text_style, redraw } from '@zos/ui'
import { exit as routerExit } from '@zos/router'
import { getIntakes, getTakeLogs, addTakeLog, getTodayDateStr } from '../../utils/storage'
import { sendTakeLogToPhone } from '../../utils/sync'
import { isIntakeTakenToday } from '../../utils/intake-logic'
import { getRandomPraiseMessage } from '../../utils/praise-messages'
import { sysText, getUiScale } from '../../utils/ui-scale'
import { getContentBounds, renderNavButton } from '../../utils/screen-layout'
import { createViewManager } from '../../utils/view-manager'
import { wrapText } from '../../utils/text-wrap'

const logger = Logger.getLogger('aibolit-take-page')

Page({
  state: {
    message: '',
  },

  build() {
    logger.log('take page build')
    this._destroyed = false
    this.renderView()
  },

  onInit(params) {
    logger.log('take page onInit: ' + params)

    let parsed = null
    try {
      parsed = JSON.parse(params)
    } catch (e) {
      parsed = null
    }

    const intakeId = parsed ? (parsed.intakeId || parsed.intakeID) : null
    if (intakeId) {
      const intake = getIntakes().find(i => i.id === intakeId)
      this.takeIntake(intakeId, intake)
    }

    this.state.message = getRandomPraiseMessage()
  },

  takeIntake(intakeId, intake) {
    const todayDateStr = getTodayDateStr()
    const takeLogs = getTakeLogs()
    if (isIntakeTakenToday(intakeId, todayDateStr, takeLogs)) {
      logger.log('take page: already taken today ' + intakeId)
      return
    }

    const now = new Date()
    const takenTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

    const takeLog = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      intakeId: intakeId,
      date: todayDateStr,
      time: intake ? intake.time : null,
      takenTime: takenTime,
      status: 'taken',
      items: intake ? (intake.items || []).map(item => ({ ...item })) : [],
    }

    addTakeLog(takeLog)
    sendTakeLogToPhone(takeLog)
    logger.log('Intake ' + intakeId + ' taken at ' + takenTime)
  },

  renderView() {
    if (!this.ui) this.ui = createViewManager(createWidget, deleteWidget)
    this.ui.clear()

    const S = getUiScale()
    const bounds = getContentBounds()
    const headerH = 48 * S
    const gap = 12 * S
    const btnH = 48 * S
    const btnGap = 24 * S
    const msgSize = sysText(24)
    const msgW = bounds.width
    const lineH = 34 * S

    this.ui.create(widget.TEXT, {
      x: bounds.left,
      y: bounds.top,
      w: bounds.width,
      h: headerH,
      color: 0x4caf50,
      text_size: sysText(28),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'Принято \u2713',
    })

    const lines = wrapText(this.state.message, msgSize, msgW)
    const textBlockH = lines.length * lineH
    const btnY = bounds.bottom - btnH
    const availableTop = bounds.top + headerH + gap
    const availableBottom = btnY - btnGap
    const msgY = availableTop + Math.max(0, (availableBottom - availableTop - textBlockH) / 2)

    for (let i = 0; i < lines.length; i++) {
      this.ui.create(widget.TEXT, {
        x: bounds.left,
        y: msgY + i * lineH,
        w: bounds.width,
        h: lineH,
        color: 0xffffff,
        text_size: msgSize,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: lines[i],
      })
    }

    const closeBtn = renderNavButton(this.ui, {
      x: bounds.left,
      y: btnY,
      w: bounds.width,
      h: btnH,
      text: 'Готово',
    })
    closeBtn.addEventListener(event.CLICK_UP, () => {
      routerExit()
    })

    redraw()
  },

  onDestroy() {
    logger.log('take page onDestroy')
    this._destroyed = true
    if (this.ui) this.ui.clear()
  },
})
