import { log as Logger } from '@zos/utils'
import { createSnoozeAlarm } from '../utils/schedule'
import { addTakeLog, getIntakes, getTodayDateStr } from '../utils/storage'
import { INTAKE_STATUS } from '../utils/constants'

const logger = Logger.getLogger('aibolit-snooze')

function handleEvent(e) {
  logger.log('snooze-handler handleEvent: ' + e)

  let params
  try {
    params = JSON.parse(e)
  } catch (err) {
    logger.log('Failed to parse: ' + e)
    return
  }

  const { intakeId, delayMinutes } = params
  if (!intakeId || !delayMinutes) return

  const intake = getIntakes().find(i => i.id === intakeId)
  if (!intake) return

  createSnoozeAlarm(intakeId, delayMinutes)

  const todayDateStr = getTodayDateStr()
  const now = new Date()
  const snoozeRecord = {
    id: 'snooze_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    intakeId: intakeId,
    date: todayDateStr,
    time: intake.time,
    takenTime: String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'),
    status: INTAKE_STATUS.SNOOZED,
    items: (intake.items || []).map(item => ({ ...item })),
  }

  addTakeLog(snoozeRecord)
  logger.log('Snoozed intake ' + intakeId + ' for ' + delayMinutes + 'min')
}

AppService({
  onInit(e) {
    logger.log('snooze-handler onInit')
    handleEvent(e)
  },

  onEvent(e) {
    logger.log('snooze-handler onEvent: ' + e)
    handleEvent(e)
  },

  onDestroy() {
    logger.log('snooze-handler onDestroy')
  },
})
