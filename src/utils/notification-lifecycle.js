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
import { cancelAlarmById } from './schedule'
import { INTAKE_STATUS, DEFAULT_SETTINGS } from './constants'
import { buildItemsSummary, isIntakeTakenToday, isIntakeCancelledToday, isIntakeSkippedToday } from './intake-logic.js'
import { sendTakeLogToPhone } from './sync'
import { addDebugEntry } from './debug-log'

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

export function issueNotification(intakeId, source) {
  const label = source || 'уведомление'
  logger.log('issueNotification(' + intakeId + ') start')
  const intake = getIntakes().find(i => i.id === intakeId)
  if (!intake) {
    logger.log('issueNotification: intake not found ' + intakeId)
    addDebugEntry(`уведомление не выдано (${label}): приём ${intakeId} не найден`)
    return
  }

  const todayDateStr = getTodayDateStr()
  if (isResolvedToday(intakeId, todayDateStr)) {
    logger.log('issueNotification: intake already resolved today ' + intakeId)
    addDebugEntry(`уведомление не выдано (${label}): приём ${intakeId} уже принят, отменён или пропущен`)
    return
  }

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
        addDebugEntry(`предыдущий приём ${pending.intakeId} помечен пропущенным при выдаче нового`)
      }
    }
  }

  cancelAllNotifications()

  setPendingNotification({ intakeId: intakeId, date: todayDateStr, issuedAt: Date.now() })

  const content = buildItemsSummary(intake.items || [], getMedications()) || 'Примите лекарство'

  let id
  try {
    id = notify({
      title: 'Пора принимать лекарства',
      content: content,
      vibrate: 1,
      actions: [
        { text: 'Принял', file: 'page/take/index', param: JSON.stringify({ intakeId }) },
        { text: 'Отложить', file: 'page/snooze/index', param: JSON.stringify({ intakeId }) },
        { text: 'Отменить', file: 'page/cancel/index', param: JSON.stringify({ intakeId }) },
      ],
    })
  } catch (e) {
    logger.log('Notification issue failed: ' + e)
    addDebugEntry(`ошибка при выдаче уведомления (${label}) для приёма ${intakeId}: ${e}`)
    return
  }

  logger.log('Notification issued for ' + intakeId + ' id=' + id)
  addDebugEntry(`уведомление выдано (${label}) для приёма ${intakeId}, id=${id}`)
}

export function maybeRetryPending() {
  const pending = getPendingNotification()
  if (!pending || typeof pending !== 'object') {
    addDebugEntry('повтор не выводится: нет ожидающего уведомления')
    return
  }
  const intakeId = pending.intakeId
  if (!intakeId || !pending.issuedAt) {
    addDebugEntry('повтор не выводится: неполный pending')
    return
  }

  const todayDateStr = getTodayDateStr()
  if (pending.date !== todayDateStr) {
    logger.log('maybeRetryPending: stale pending for a past day, skip')
    addDebugEntry(`повтор не выводится: pending за прошлый день (${pending.date})`)
    return
  }

  const intake = getIntakes().find(i => i.id === intakeId)
  if (!intake) {
    logger.log('maybeRetryPending: intake not found ' + intakeId)
    addDebugEntry(`повтор не выводится: приём ${intakeId} не найден`)
    return
  }

  if (isResolvedToday(intakeId, todayDateStr)) {
    logger.log('maybeRetryPending: intake already resolved, skip')
    addDebugEntry(`повтор не выводится: приём ${intakeId} уже принят, отменён или пропущен`)
    return
  }

  const settings = getSettings()
  const raw = settings && settings.retryInterval
  const delay = Number(raw !== undefined && raw !== null ? raw : DEFAULT_SETTINGS.retryInterval)
  if (!Number.isFinite(delay) || delay <= 0) {
    addDebugEntry(`повтор не выводится: некорректный интервал повтора (${raw})`)
    return
  }

  if (!nextRetryIsToday(new Date(), delay)) {
    logger.log('maybeRetryPending: retry would cross midnight, skip')
    addDebugEntry('повтор не выводится: следующий повтор пересёк бы полночь')
    return
  }

  const elapsed = Date.now() - pending.issuedAt
  if (elapsed < delay * 60 * 1000) {
    logger.log('maybeRetryPending: interval not elapsed yet, skip')
    addDebugEntry(`повтор не выводится: интервал ещё не прошёл (прошло ${Math.round(elapsed / 1000)} с из ${delay * 60} с)`)
    return
  }

  logger.log('maybeRetryPending: issuing retry for ' + intakeId)
  addDebugEntry(`повтор выводится для приёма ${intakeId}`)
  issueNotification(intakeId, 'повтор')
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
