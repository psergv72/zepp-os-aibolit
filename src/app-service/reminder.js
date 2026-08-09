import { log as Logger } from '@zos/utils'
import { fetchConfigFromSide } from '../utils/watch-config'
import { refreshAlarms } from '../utils/schedule'
import { retrySync } from '../utils/sync'
import { ALARM_MODES } from '../utils/constants'
import { getTodayDateStr, clearSnoozeAlarmId } from '../utils/storage'
import { issueNotification, maybeRetryPending } from '../utils/notification-lifecycle'

const logger = Logger.getLogger('aibolit-reminder')

function handleEvent(e) {
  logger.log('reminder handleEvent: ' + e)

  let params
  try {
    params = JSON.parse(e)
  } catch (err) {
    logger.log('Failed to parse event params: ' + e)
    return
  }

  const { mode, intakeId, date } = params

  if (mode === ALARM_MODES.SYNC) {
    logger.log('sync tick: apply config, refresh alarms, retry queue')
    fetchConfigFromSide()
    refreshAlarms()
    retrySync()
    return
  }

  if (mode === ALARM_MODES.RETRY_TICK) {
    logger.log('retry tick: maybe retry pending')
    maybeRetryPending()
    return
  }

  if (!intakeId) {
    logger.log('reminder: no intakeId in ' + e)
    return
  }

  if (mode === ALARM_MODES.SNOOZE) {
    clearSnoozeAlarmId()
  }

  if ((mode === ALARM_MODES.RETRY || mode === ALARM_MODES.SNOOZE) && date && date !== getTodayDateStr()) {
    logger.log('stale ' + mode + ' event for a past day, skip')
    return
  }

  logger.log('reminder: issue notification for mode=' + mode + ' intakeId=' + intakeId + ' date=' + date)
  issueNotification(intakeId)
}

AppService({
  onInit(e) {
    logger.log('reminder onInit(' + e + ')')
    handleEvent(e)
  },

  onEvent(e) {
    logger.log('reminder onEvent: ' + e)
    handleEvent(e)
  },

  onDestroy() {
    logger.log('reminder onDestroy')
  },
})
