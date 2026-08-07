import { log as Logger } from '@zos/utils'
import { createWidget, widget, event, align, text_style } from '@zos/ui'
import { exit as routerExit } from '@zos/router'
import { getIntakes, getMedications, getTakeLogs, addCancellation, getTodayDateStr } from '../../utils/storage'
import { sendCancellationToPhone } from '../../utils/sync'
import { clearPendingForIntake } from '../../utils/notification-lifecycle'
import { isIntakeTakenToday } from '../../utils/intake-logic'
import { sysText, getUiScale } from '../../utils/ui-scale'
import { getContentBounds } from '../../utils/screen-layout'

const logger = Logger.getLogger('aibolit-cancel-page')

Page({
  state: {
    intakeId: null,
    intake: null,
  },

  build() {
    logger.log('cancel page build')
  },

  onInit(params) {
    logger.log('cancel page onInit: ' + params)

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

    this.renderCancel()
  },

  onDestroy() {
    logger.log('cancel page onDestroy')
  },

  renderCancel() {
    const S = getUiScale()
    const bounds = getContentBounds()
    const centerX = 480 / 2

    const intake = this.state.intake

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

    const gap = 20 * S
    const titleH = 40 * S
    const itemsH = 28 * S
    const questionH = 32 * S

    const itemsBottom = bounds.top + titleH + gap + itemsH + gap + questionH + gap
    const showItems = itemsText && itemsBottom <= bounds.bottom - 72 * S

    let y = bounds.top

    createWidget(widget.TEXT, {
      x: bounds.left,
      y: y,
      w: bounds.width,
      h: titleH,
      color: 0xffffff,
      text_size: sysText(28),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: intake ? (intake.label || intake.time) : '',
    })
    y += titleH + gap

    if (showItems) {
      createWidget(widget.TEXT, {
        x: bounds.left,
        y: y,
        w: bounds.width,
        h: itemsH,
        color: 0x888888,
        text_size: sysText(22),
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: itemsText,
      })
      y += itemsH + gap
    }

    createWidget(widget.TEXT, {
      x: bounds.left,
      y: y,
      w: bounds.width,
      h: questionH,
      color: 0xffffff,
      text_size: sysText(26),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'Отменить приём на сегодня?',
    })
    y += questionH + gap

    const btnH = Math.max(0, Math.min(72 * S, bounds.bottom - y))
    const btnTextSp = Math.max(16, Math.min(32, Math.floor(btnH / S)))
    const btnW = (bounds.width - gap) / 2
    const gridX = centerX - (btnW * 2 + gap) / 2

    const noBtn = createWidget(widget.TEXT, {
      x: gridX,
      y: y,
      w: btnW,
      h: btnH,
      color: 0x4fc3f7,
      text_size: sysText(btnTextSp),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'Нет',
    })
    noBtn.addEventListener(event.CLICK_UP, () => {
      routerExit()
    })

    const yesBtn = createWidget(widget.TEXT, {
      x: gridX + btnW + gap,
      y: y,
      w: btnW,
      h: btnH,
      color: 0xff6b6b,
      text_size: sysText(btnTextSp),
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'Да',
    })
    yesBtn.addEventListener(event.CLICK_UP, () => {
      this.confirmCancel()
    })
  },

  confirmCancel() {
    const intakeId = this.state.intakeId
    if (!intakeId) {
      routerExit()
      return
    }

    const todayDateStr = getTodayDateStr()
    const takeLogs = getTakeLogs()
    if (isIntakeTakenToday(intakeId, todayDateStr, takeLogs)) {
      logger.log('cancel: already taken today ' + intakeId)
      routerExit()
      return
    }

    addCancellation(intakeId, todayDateStr)
    sendCancellationToPhone(intakeId, todayDateStr)
    clearPendingForIntake(intakeId)
    logger.log('Cancelled intake ' + intakeId + ' for ' + todayDateStr)

    routerExit()
  },
})
