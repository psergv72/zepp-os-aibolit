import { log as Logger } from '@zos/utils'
import { createWidget, widget, event, align, text_style } from '@zos/ui'
import { push as routerPush } from '@zos/router'
import { getMedications, getIntakes, getTakeLogs, getCancellations, addTakeLog, getTodayDateStr } from '../../utils/storage'
import { sendTakeLogToPhone } from '../../utils/sync'
import { getIntakeEntries, isIntakeOnDay, isIntakeTakenToday, isIntakeCancelledToday } from '../../utils/intake-logic.js'
import { fetchConfigFromSide } from '../../utils/watch-config'
import { getSysFontScale } from '../../utils/ui-scale'

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
    const screenWidth = 480
    const S = getSysFontScale()
    const btnHeight = 48 * S
    const btnY = 380 * S
    let y = 20 * S

    createWidget(widget.TEXT, {
      x: 0,
      y: y,
      w: screenWidth,
      h: 48 * S,
      color: 0xffffff,
      text_size: 32 * S,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: 'Ближайшие приёмы',
    })
    y += 60 * S

    if (entries.length === 0) {
      createWidget(widget.TEXT, {
        x: 0,
        y: y,
        w: screenWidth,
        h: 36 * S,
        color: 0x888888,
        text_size: 26 * S,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: 'Нет предстоящих приёмов',
      })
    }

    for (const entry of entries) {
      const blockH = (48 + entry.items.length * 40 + 12) * S
      if (y + blockH > btnY - 5) break

      const intake = entry.intake

      createWidget(widget.TEXT, {
        x: 20,
        y: y,
        w: screenWidth - 60,
        h: 44 * S,
        color: 0x4fc3f7,
        text_size: 26 * S,
        align_h: align.LEFT,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: '───── ' + intake.time + ' ────',
      })
      y += 44 * S

      for (const item of entry.items) {
        createWidget(widget.TEXT, {
          x: 40,
          y: y,
          w: screenWidth - 90,
          h: 40 * S,
          color: 0xffffff,
          text_size: 24 * S,
          align_h: align.LEFT,
          align_v: align.CENTER_V,
          text_style: text_style.NONE,
          text: item.med.name + ' \u00d7 ' + (item.amount || ''),
        })
        y += 40 * S
      }

      const checkboxX = screenWidth - 50
      const checkboxY = y - (entry.items.length * 40 + 5) * S
      const checkboxH = (entry.items.length * 40 + 12) * S

      const takeAllBtn = createWidget(widget.TEXT, {
        x: checkboxX,
        y: checkboxY,
        w: 40,
        h: checkboxH,
        color: 0x4fc3f7,
        text_size: 36 * S,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text_style: text_style.NONE,
        text: '\u2610',
      })
      takeAllBtn.addEventListener(event.CLICK_UP, () => {
        this.takeIntake(intake)
      })

      y += 10 * S
    }

    const planBtn = createWidget(widget.TEXT, {
      x: 0,
      y: btnY,
      w: screenWidth,
      h: btnHeight,
      color: 0x888888,
      text_size: 26 * S,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
      text_style: text_style.NONE,
      text: '[Полный план \u2192]',
    })
    planBtn.addEventListener(event.CLICK_UP, () => {
      routerPush({ url: 'page/plan/index' })
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
