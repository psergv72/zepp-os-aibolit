import { log as Logger } from '@zos/utils'
import { createSnoozeAlarm } from '../utils/schedule'
import { addIntake, getTodayDateStr } from '../utils/storage'
import { INTAKE_STATUS } from '../utils/constants'

const logger = Logger.getLogger('aibolit-snooze')

AppService({
  onEvent(e) {
    logger.log('snooze-handler onEvent: ' + e)

    let params
    try {
      params = JSON.parse(e)
    } catch (err) {
      logger.log('Failed to parse: ' + e)
      return
    }

    const { slotId, medicationId, medicationName, dosage, delayMinutes } = params
    if (!slotId || !delayMinutes) return

    createSnoozeAlarm(slotId, medicationId, medicationName, dosage, delayMinutes)

    const todayDateStr = getTodayDateStr()
    const now = new Date()
    const snoozeRecord = {
      id: 'snooze_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      medicationId: medicationId || '',
      scheduleId: slotId,
      date: todayDateStr,
      scheduledTime: '',
      takenTime: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
      status: INTAKE_STATUS.SNOOZED,
    }

    addIntake(snoozeRecord)
    logger.log('Snoozed ' + medicationName + ' for ' + delayMinutes + 'min')
  },

  onInit(e) {
    logger.log('snooze-handler onInit')
  },

  onDestroy() {
    logger.log('snooze-handler onDestroy')
  },
})
