import { log as Logger } from '@zos/utils'
import { notify, cancel, getAllNotifications } from '@zos/notification'
import {
  getIntakes,
  getMedications,
  getTakeLogs,
  getCancellations,
  getTodayDateStr,
  getSettings,
  getPendingNotification,
  setPendingNotification,
  clearPendingNotification,
  addTakeLog,
} from './storage'
import { createRetryAlarm, cancelAlarmById } from './schedule'
import { INTAKE_STATUS, DEFAULT_SETTINGS } from './constants'
import { buildItemsSummary, isIntakeTakenToday, isIntakeCancelledToday, isIntakeSkippedToday } from './intake-logic.js'
import { sendTakeLogToPhone } from './sync'

const logger = Logger.getLogger('aibolit-notif-lifecycle')

export function cancelAllNotifications() {
  try {
    const ids = getAllNotifications()
    if (ids && ids.length > 0) cancel(ids)
  } catch (e) {
    logger.log('cancelAllNotifications failed: ' + e)
  }
}

export function getPendingIntake() {
  const pending = getPendingNotification()
  if (!pending || typeof pending !== 'object') return null
  return { intakeId: pending.intakeId, date: pending.date, retryAlarmId: pending.retryAlarmId }
}

function isResolvedToday(intakeId, date) {
  const takeLogs = getTakeLogs()
  if (isIntakeTakenToday(intakeId, date, takeLogs)) return true
  if (isIntakeCancelledToday(intakeId, date, getCancellations())) return true
  if (isIntakeSkippedToday(intakeId, date, takeLogs)) return true
  return false
}

export function markSkipped(intakeId, date) {
  const intake = getIntakes().find(i => i.id === intakeId)
  const record = {
    id: 'skip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    intakeId: intakeId,
    date: date,
    time: intake ? intake.time : null,
    status: INTAKE_STATUS.SKIPPED,
    items: intake ? (intake.items || []).map(item => ({ ...item })) : [],
  }
  addTakeLog(record)
  sendTakeLogToPhone(record)
  logger.log('Intake ' + intakeId + ' marked skipped for ' + date)
  return record
}

export function clearPendingForIntake(intakeId) {
  const pending = getPendingIntake()
  if (!pending || pending.intakeId !== intakeId) return
  if (pending.retryAlarmId) {
    try {
      cancelAlarmById(pending.retryAlarmId)
    } catch (e) {
      logger.log('Cancel retry alarm failed: ' + e)
    }
  }
  cancelAllNotifications()
  clearPendingNotification()
  logger.log('Cleared pending notification for ' + intakeId)
}

export function issueNotification(intakeId) {
  const intake = getIntakes().find(i => i.id === intakeId)
  if (!intake) return

  const todayDateStr = getTodayDateStr()
  if (isResolvedToday(intakeId, todayDateStr)) return

  const pending = getPendingIntake()
  if (pending) {
    if (pending.retryAlarmId) {
      try {
        cancelAlarmById(pending.retryAlarmId)
      } catch (e) {
        logger.log('Cancel retry alarm failed: ' + e)
      }
    }
    if (pending.date === todayDateStr && pending.intakeId !== intakeId) {
      const pendingIntake = getIntakes().find(i => i.id === pending.intakeId)
      if (pendingIntake && !isResolvedToday(pending.intakeId, todayDateStr)) {
        markSkipped(pending.intakeId, todayDateStr)
      }
    }
  }

  cancelAllNotifications()

  const title = 'Пора принимать лекарства'
  const content = buildItemsSummary(intake.items || [], getMedications()) || 'Примите лекарство'

  const id = notify({
    title: title,
    content: content,
    vibrate: 1,
    actions: [
      { text: 'Принял', file: 'page/take/index', param: JSON.stringify({ intakeId }) },
      { text: 'Отложить', file: 'page/snooze/index', param: JSON.stringify({ intakeId }) },
      { text: 'Отменить', file: 'page/cancel/index', param: JSON.stringify({ intakeId }) },
    ],
  })

  const retryAlarmId = scheduleRetry(intakeId)
  setPendingNotification({ intakeId: intakeId, date: todayDateStr, retryAlarmId: retryAlarmId })

  logger.log('Notification issued for ' + intakeId + ' id=' + id)
}

function dateStrOf(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

export function nextRetryIsToday(now, delayMinutes) {
  const next = new Date(now.getTime() + delayMinutes * 60 * 1000)
  return dateStrOf(next) === dateStrOf(now)
}

function scheduleRetry(intakeId) {
  const settings = getSettings()
  const raw = settings && settings.retryInterval
  const delay = Number(raw !== undefined && raw !== null ? raw : DEFAULT_SETTINGS.retryInterval)
  if (!Number.isFinite(delay) || delay <= 0) return null
  if (!nextRetryIsToday(new Date(), delay)) {
    logger.log('Retry would cross midnight, skipping')
    return null
  }
  return createRetryAlarm(intakeId, delay, getTodayDateStr())
}
