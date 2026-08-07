import { log as Logger } from '@zos/utils'
import { createWidget, widget, event, align, text_style } from '@zos/ui'
import { exit as routerExit } from '@zos/router'
import { getSettings, getIntakes, getMedications, getTakeLogs, addTakeLog, getTodayDateStr } from '../../utils/storage'
import { sendTakeLogToPhone } from '../../utils/sync'
import { isIntakeTakenToday } from '../../utils/intake-logic'
import { createSnoozeAlarm } from '../../utils/schedule'
import { clearPendingForIntake } from '../../utils/notification-lifecycle'
import { INTAKE_STATUS } from '../../utils/constants'
import { sysText, getUiScale } from '../../utils/ui-scale'
import { getContentBounds } from '../../utils/screen-layout'

const logger = Logger.getLogger('aibolit-snooze-page')

Page({
  state: {
    intakeId: null,
    intake: null,
  },

  build() {
    logger.log('snooze page build')
  },

  onInit(params) {
    logger.log('snooze page onInit: ' + params)

    let parsed
    try {
      parsed = JSON.parse(params)
    } catch (e) {
      logger.log('Failed to parse params: ' + params)
      return
    }

    const intakeId = parsed.intakeId || parsed.intakeID
    this.state.intakeId = intakeId
    this.state.intake = getIntakes().find(i => i.id === intakeId) || null

    this.renderSnoozeOptions()
  },

  onDestroy() {
    logger.log('snooze page onDestroy')
  },

  renderSnoozeOptions() {
    const settings = getSettings()
    const options = settings.snoozeOptions || [30, 45, 60, 90]
    const intake = this.state.intake
    const S = getUiScale()
    const bounds = getContentBounds()
    const centerX = 480 / 2
    let y = bounds.top

    const medications = getMedications()
    const medMap = {}
    for (const med of medications) medMap[med.id] = med

    const itemsText = (intake && intake.items ? intake.items : [])
      .map(item => {
        const med = medMap[item.medicationId]
        return med ? med.name + ' \u00d7 ' + (item.amount || '') : null
      })
      .filter(Boolean)
      .join(', ')

    createWidget(widget.TEXT, {
      x: bounds.left,
      y: y,
      w: bounds.width,
      h: 40 * S,
      color: 0xffffff,
      text_size: sysText(28),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: intake ? (intake.label || intake.time) : '',
    })
    y += 48 * S

    if (itemsText) {
      createWidget(widget.TEXT, {
        x: bounds.left,
        y: y,
        w: bounds.width,
        h: 28 * S,
        color: 0x888888,
        text_size: sysText(22),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: itemsText,
      })
      y += 30 * S
    }

    createWidget(widget.TEXT, {
      x: bounds.left,
      y: y,
      w: bounds.width,
      h: 28 * S,
      color: 0x888888,
      text_size: sysText(22),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'Отложить на:',
    })
    y += 40 * S

    const gap = 20 * S
    const rows = Math.ceil(options.length / 2)
    const btnH = Math.max(0, Math.min(72 * S, (bounds.bottom - y - (rows - 1) * gap) / rows))
    const btnW = (bounds.width - gap) / 2
    const gridX = centerX - (btnW * 2 + gap) / 2
    let col = 0
    let row = 0

    for (const minutes of options) {
      const bx = gridX + col * (btnW + gap)
      const by = y + row * (btnH + gap)

      createWidget(widget.TEXT, {
        x: bx,
        y: by + Math.floor(btnH / 2) - 18 * S,
        w: btnW,
        h: 40 * S,
        color: 0x4fc3f7,
        text_size: sysText(40),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: String(minutes),
      })

      createWidget(widget.TEXT, {
        x: bx,
        y: by + Math.floor(btnH / 2) + 14 * S,
        w: btnW,
        h: 24 * S,
        color: 0x888888,
        text_size: sysText(20),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: 'мин',
      })

      const btnArea = createWidget(widget.TEXT, {
        x: bx,
        y: by,
        w: btnW,
        h: btnH,
        color: 0xFFFFFF,
        text_size: 1,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: '',
      })
      btnArea.addEventListener(event.CLICK_UP, () => {
        this.confirmSnooze(minutes)
      })

      col++
      if (col >= 2) {
        col = 0
        row++
      }
    }
  },

  confirmSnooze(delayMinutes) {
    const intakeId = this.state.intakeId
    const intake = this.state.intake

    if (!intakeId || !delayMinutes) {
      routerExit()
      return
    }

    const todayDateStr = getTodayDateStr()
    const takeLogs = getTakeLogs()
    if (isIntakeTakenToday(intakeId, todayDateStr, takeLogs)) {
      logger.log('snooze: already taken today ' + intakeId)
      routerExit()
      return
    }

    createSnoozeAlarm(intakeId, delayMinutes, todayDateStr)
    clearPendingForIntake(intakeId)

    const now = new Date()
    const snoozeRecord = {
      id: 'snooze_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      intakeId: intakeId,
      date: todayDateStr,
      time: intake ? intake.time : null,
      takenTime: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
      status: INTAKE_STATUS.SNOOZED,
      items: intake ? (intake.items || []).map(item => ({ ...item })) : [],
    }

    addTakeLog(snoozeRecord)
    sendTakeLogToPhone(snoozeRecord)
    logger.log('Snoozed intake ' + intakeId + ' for ' + delayMinutes + 'min')

    routerExit()
  },
})
