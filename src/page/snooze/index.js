import { log as Logger } from '@zos/utils'
import { createWidget, widget, event, align, text_style } from '@zos/ui'
import { push as routerPush } from '@zos/router'
import { getSettings, getIntakes, getMedications } from '../../utils/storage'

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

    this.state.intakeId = parsed.intakeId
    this.state.intake = getIntakes().find(i => i.id === parsed.intakeId) || null

    this.renderSnoozeOptions()
  },

  onDestroy() {
    logger.log('snooze page onDestroy')
  },

  renderSnoozeOptions() {
    const screenWidth = 480
    const settings = getSettings()
    const options = settings.snoozeOptions || [30, 45, 60, 90]
    const intake = this.state.intake
    let y = 40

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
      x: 0,
      y: y,
      w: screenWidth,
      h: 30,
      color: 0xffffff,
      text_size: 18,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: intake ? (intake.label || intake.time) : '',
    })
    y += 45

    if (itemsText) {
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
        text: itemsText,
      })
      y += 28
    }

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

    const param = JSON.stringify({
      intakeId: intakeId,
      delayMinutes: delayMinutes,
    })

    routerPush({ url: 'app-service/snooze-handler', param: param })
  },
})
