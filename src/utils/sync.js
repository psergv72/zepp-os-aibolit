import { log as Logger } from '@zos/utils'
import { ZML_METHODS, INTAKE_STATUS } from './constants'
import { getSyncQueue, addToSyncQueue, clearSyncedItems, pruneOldTakeLogs, getTakeLogs, setTakeLogs } from './storage'

const logger = Logger.getLogger('aibolit-sync')

let sideService = null
let syncing = false
let pendingSync = false

export function initSync(zmlSideService) {
  sideService = zmlSideService
  logger.log('Sync module initialized')
}

function getMessaging() {
  if (sideService && typeof sideService.request === 'function') return sideService
  try {
    const app = getApp()
    const messaging = app && app._options && app._options.globalData && app._options.globalData.messaging
    return messaging && typeof messaging.request === 'function' ? messaging : null
  } catch (e) {
    return null
  }
}

export function fetchTakesFromPhone(date) {
  const messaging = getMessaging()
  if (!messaging) return Promise.resolve([])

  return messaging.request({
    method: ZML_METHODS.GET_TAKE_LOGS,
    params: { date },
  })
    .then((result) => (result && result.records) || [])
    .catch((error) => {
      logger.log(`Fetch takes failed: ${error}`)
      return []
    })
}

export function mergeTakeRecords(records) {
  if (!records || records.length === 0) return false

  const takeLogs = getTakeLogs()
  const queue = getSyncQueue()
  const hasPendingUndo = (intakeId, date) => queue.some(q => q.intakeId === intakeId && q.date === date && q.status === INTAKE_STATUS.UNDONE)
  let changed = false
  for (const record of records) {
    if (!record || !record.id || record.status !== 'taken') continue
    if (hasPendingUndo(record.intakeId, record.date)) continue
    if (takeLogs.some(i => i.id === record.id)) continue
    takeLogs.push(record)
    changed = true
  }
  if (changed) setTakeLogs(takeLogs)
  return changed
}

export function sendTakeLogToPhone(takeLog) {
  addToSyncQueue(takeLog)
  scheduleSync()
}

export function sendCancellationToPhone(intakeId, date) {
  const record = {
    id: 'cancel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    intakeId,
    date,
    status: INTAKE_STATUS.CANCELLED,
  }
  addToSyncQueue(record)
  scheduleSync()
}

export function sendUndoTakeToPhone(intakeId, date) {
  const record = {
    id: 'undo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    intakeId,
    date,
    status: INTAKE_STATUS.UNDONE,
  }
  addToSyncQueue(record)
  scheduleSync()
}

function scheduleSync() {
  if (syncing) {
    pendingSync = true
    return
  }
  syncing = true
  trySyncNow()
    .catch(() => {})
    .finally(() => {
      syncing = false
      if (pendingSync) {
        pendingSync = false
        scheduleSync()
      }
    })
}

function trySyncNow() {
  const messaging = getMessaging()
  if (!messaging) return Promise.resolve()

  const queue = getSyncQueue().slice()
  if (queue.length === 0) return Promise.resolve()

  const payload = {
    method: ZML_METHODS.SYNC_INTAKE,
    params: {
      records: queue,
    },
  }

  const onSuccess = () => {
    const ids = queue.map(item => item.id)
    clearSyncedItems(ids)
    pruneOldTakeLogs()
    logger.log(`Synced ${ids.length} records to phone`)
  }

  try {
    const result = messaging.request(payload)
    if (result && typeof result.then === 'function') {
      return result.then(onSuccess).catch((error) => {
        logger.log(`Sync failed: ${error}, will retry later`)
      })
    }
    onSuccess()
    return Promise.resolve()
  } catch (error) {
    logger.log(`Sync failed: ${error}, will retry later`)
    return Promise.resolve()
  }
}

export function retrySync() {
  scheduleSync()
}
