import { log as Logger } from '@zos/utils'
import { notify } from '@zos/notification'
import { getSettings, getIntakes, isSlotCancelled, getTodayDateStr } from '../utils/storage'
import { createRetryAlarm } from '../utils/schedule'
import { ALARM_MODES } from '../utils/constants'

const logger = Logger.getLogger('aibolit-reminder')

AppService({
  onEvent(e) {
    logger.log('reminder onEvent: ' + e)

    let params
    try {
      params = JSON.parse(e)
    } catch (err) {
      logger.log('Failed to parse event params: ' + e)
      return
    }

    const { mode, slotId, medicationId, medicationName, dosage } = params
    if (!slotId) return

    const todayDateStr = getTodayDateStr()

    if (mode === ALARM_MODES.RETRY || mode === ALARM_MODES.SNOOZE) {
      const isCancelled = isSlotCancelled(slotId, todayDateStr)
      if (isCancelled) return

      const intakes = getIntakes()
      const alreadyTaken = intakes.some(i => i.scheduleId === slotId && i.date === todayDateStr && i.status === 'taken')
      if (alreadyTaken) return
    }

    if (mode === ALARM_MODES.REMINDER || mode === ALARM_MODES.RETRY) {
      const isCancelled = isSlotCancelled(slotId, todayDateStr)
      if (isCancelled) return

      const intakes = getIntakes()
      const alreadyTaken = intakes.some(i => i.scheduleId === slotId && i.date === todayDateStr && i.status === 'taken')
      if (alreadyTaken) return
    }

    const title = medicationName || 'Напоминание'
    const content = dosage ? dosage : 'Примите лекарство'

    notify({
      title: title,
      content: content,
      vibrate: 1,
      actions: [
        {
          text: 'Принял',
          file: 'app-service/take',
          param: JSON.stringify({ slotId, medicationId, medicationName, dosage }),
        },
        {
          text: 'Отложить',
          file: 'page/snooze/index',
          param: JSON.stringify({ slotId, medicationId, medicationName, dosage }),
        },
      ],
    })

    if (mode === ALARM_MODES.REMINDER) {
      const settings = getSettings()
      createRetryAlarm(slotId, medicationId, medicationName, dosage, settings.retryInterval)
    }

    logger.log('Notification sent for ' + title)
  },

  onInit(e) {
    logger.log('reminder onInit(' + e + ')')
  },

  onDestroy() {
    logger.log('reminder onDestroy')
  },
})
