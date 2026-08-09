import { log as Logger } from '@zos/utils'
import { getAllAlarms } from '@zos/alarm'
import { ZML_METHODS } from './constants'
import { getSettings, getDebugLog, setDebugLog } from './storage'

const logger = Logger.getLogger('aibolit-debug')

const MAX_DEBUG_LOG_ENTRIES = 100

export function isDebugModeEnabled() {
  const settings = getSettings()
  return !!(settings && settings.debugMode)
}

export function addDebugEntry(message) {
  if (!isDebugModeEnabled()) return
  const log = getDebugLog()
  log.push({ ts: Date.now(), message })
  while (log.length > MAX_DEBUG_LOG_ENTRIES) log.shift()
  setDebugLog(log)
}

export function clearDebugLog() {
  setDebugLog([])
}

export function getCurrentAlarmIds() {
  try {
    const alarms = getAllAlarms()
    return Array.isArray(alarms) ? alarms : []
  } catch (e) {
    logger.log(`getAllAlarms failed: ${e}`)
    return []
  }
}

export function buildDebugSnapshot() {
  return {
    timers: getCurrentAlarmIds(),
    log: getDebugLog(),
  }
}

function getMessaging() {
  try {
    const app = getApp()
    return app && app._options && app._options.globalData && app._options.globalData.messaging
  } catch (e) {
    return null
  }
}

export function pushDebugSnapshot() {
  const messaging = getMessaging()
  if (!messaging || typeof messaging.request !== 'function') return
  const snapshot = buildDebugSnapshot()
  try {
    messaging.request({
      method: ZML_METHODS.DEBUG_SYNC,
      params: { snapshot },
    })
      .then(() => logger.log('debug snapshot pushed'))
      .catch((error) => logger.log(`debug snapshot push failed: ${error}`))
  } catch (error) {
    logger.log(`debug snapshot push failed: ${error}`)
  }
}
