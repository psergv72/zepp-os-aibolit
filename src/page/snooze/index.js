import { log as Logger } from '@zos/utils'
import { createWidget, widget, align, text_style } from '@zos/ui'
import { push as routerPush } from '@zos/router'
import { getSettings } from '../../utils/storage'
import { addIntake, getTodayDateStr } from '../../utils/storage'
import { INTAKE_STATUS } from '../../utils/constants'

const logger = Logger.getLogger('aibolit-snooze-page')

Page({
  state: {
    slotId: null,
    medicationId: null,
    medicationName: '',
    dosage: '',
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

    this.state.slotId = parsed.slotId
    this.state.medicationId = parsed.medicationId
    this.state.medicationName = parsed.medicationName || ''
    this.state.dosage = parsed.dosage || ''

    this.renderSnoozeOptions()
  },

  onDestroy() {
    logger.log('snooze page onDestroy')
  },

  renderSnoozeOptions() {
    const screenWidth = 480
    const settings = getSettings()
    const options = settings.snoozeOptions || [30, 45, 60, 90]
    let y = 40

    createWidget(widget.TEXT, {
      x: 0,
      y: y,
      w: screenWidth,
      h: 30,
      color: 0xffffff,
      text_size: 18,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: this.state.medicationName + ' ' + this.state.dosage,
    })
    y += 45

    createWidget(widget.TEXT, {
      x: 0,
      y: y,
      w: screenWidth,
      h: 24,
      color: 0x888888,
      text_size: 14,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'Отложить на:',
    })
    y += 40

    const btnWidth = 140
    const btnHeight = 80
    const gap = 20
    const startX = Math.floor((screenWidth - btnWidth * 2 - gap) / 2)
    let col = 0
    let row = 0

    for (const minutes of options) {
      const bx = startX + col * (btnWidth + gap)
      const by = y + row * (btnHeight + gap)

      createWidget(widget.TEXT, {
        x: bx,
        y: by + Math.floor(btnHeight / 2) - 15,
        w: btnWidth,
        h: 40,
        color: 0x4fc3f7,
        text_size: 28,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: String(minutes),
      })

      createWidget(widget.TEXT, {
        x: bx,
        y: by + Math.floor(btnHeight / 2) + 15,
        w: btnWidth,
        h: 20,
        color: 0x888888,
        text_size: 14,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: 'мин',
      })

      const btnArea = createWidget(widget.TEXT, {
        x: bx,
        y: by,
        w: btnWidth,
        h: btnHeight,
        color: 0xFFFFFF,
        text_size: 1,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: '',
      })
      btnArea.addEventListener(widget.CLICK_EVENT, () => {
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
    const slotId = this.state.slotId
    const medicationId = this.state.medicationId
    const medicationName = this.state.medicationName
    const dosage = this.state.dosage

    const todayDateStr = getTodayDateStr()
    const now = new Date()
    const record = {
      id: 'snooze_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      medicationId: medicationId || '',
      scheduleId: slotId,
      date: todayDateStr,
      scheduledTime: '',
      takenTime: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
      status: INTAKE_STATUS.SNOOZED,
    }
    addIntake(record)

    const param = JSON.stringify({
      slotId: slotId,
      medicationId: medicationId,
      medicationName: medicationName,
      dosage: dosage,
      delayMinutes: delayMinutes,
    })

    routerPush({ url: 'app-service/snooze-handler', param: param })
  },
})
