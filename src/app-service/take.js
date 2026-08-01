import { log as Logger } from '@zos/utils'
import { addTakeLog, getIntakes, getTodayDateStr } from '../utils/storage'
import { sendTakeLogToPhone } from '../utils/sync'
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

    const { intakeId } = params
    if (!intakeId) return

    const intake = getIntakes().find(i => i.id === intakeId)
    if (!intake) return

    const todayDateStr = getTodayDateStr()
    const now = new Date()
    const takenTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

    const takeLog = {
      id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      intakeId: intakeId,
      date: todayDateStr,
      time: intake.time,
      takenTime: takenTime,
      status: INTAKE_STATUS.TAKEN,
      items: (intake.items || []).map(item => ({ ...item })),
    }

    addTakeLog(takeLog)
    sendTakeLogToPhone(takeLog)
    logger.log('Intake ' + intakeId + ' taken at ' + takenTime)
  },

  onInit(e) {
    logger.log('take onInit')
  },

  onDestroy() {
    logger.log('take onDestroy')
  },
})
