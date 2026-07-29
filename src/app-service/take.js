import { log as Logger } from '@zos/utils'
import { addIntake, getTodayDateStr } from '../utils/storage'
import { sendIntakeToPhone } from '../utils/sync'
import { INTAKE_STATUS } from '../utils/constants'

const logger = Logger.getLogger('aibolit-take')

AppService({
  onEvent(e) {
    logger.log('take onEvent: ' + e)

    let params
    try {
      params = JSON.parse(e)
    } catch (err) {
      logger.log('Failed to parse: ' + e)
      return
    }

    const { slotId, medicationId, medicationName, dosage } = params
    if (!slotId) return

    const todayDateStr = getTodayDateStr()
    const now = new Date()
    const takenTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

    const intake = {
      id: 'intake_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      medicationId: medicationId || '',
      scheduleId: slotId,
      date: todayDateStr,
      scheduledTime: '',
      takenTime: takenTime,
      status: INTAKE_STATUS.TAKEN,
    }

    addIntake(intake)
    sendIntakeToPhone(intake)
    logger.log('Medication ' + medicationName + ' taken at ' + takenTime)
  },

  onInit(e) {
    logger.log('take onInit')
  },

  onDestroy() {
    logger.log('take onDestroy')
  },
})
