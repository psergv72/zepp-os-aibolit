import { log as Logger } from '@zos/utils'
import { ZML_METHODS } from './constants'
import { getSyncQueue, addToSyncQueue, clearSyncedItems, pruneOldIntakes } from './storage'

const logger = Logger.getLogger('aibolit-sync')

let sideService = null

export function initSync(zmlSideService) {
  sideService = zmlSideService
  logger.log('Sync module initialized')
}

export function sendIntakeToPhone(intake) {
  addToSyncQueue(intake)
  trySyncNow()
}

function trySyncNow() {
  if (!sideService) return

  const queue = getSyncQueue()
  if (queue.length === 0) return

  const payload = {
    method: ZML_METHODS.SYNC_INTAKE,
    params: {
      records: queue,
    },
  }

  try {
    sideService.call(payload)
    const ids = queue.map(item => item.id)
    clearSyncedItems(ids)
    pruneOldIntakes()
    logger.log(`Synced ${ids.length} records to phone`)
  } catch (error) {
    logger.log(`Sync failed: ${error}, will retry later`)
  }
}

export function sendCancellationToPhone(scheduleId, date) {
  if (!sideService) return

  const payload = {
    method: ZML_METHODS.SYNC_CANCELLATION,
    params: {
      scheduleId,
      date,
    },
  }

  try {
    sideService.call(payload)
    logger.log(`Cancellation synced for ${scheduleId} on ${date}`)
  } catch (error) {
    logger.log(`Cancellation sync failed: ${error}`)
  }
}

export function retrySync() {
  trySyncNow()
}
