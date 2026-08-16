import { ShareLocalStorage } from '@zos/storage'
import { readFileSync, writeFileSync, rmSync } from '@zos/fs'
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants'

const storage = new ShareLocalStorage('aibolit-data.json')
const PENDING_FILE = 'aibolit-pending.json'
const DEBUG_LOG_FILE = 'aibolit-debuglog.json'
const FS_FILE_NAMES = {
  [STORAGE_KEYS.ALARM_REGISTRY]: 'aibolit-alarm-registry.json',
  [STORAGE_KEYS.SYNC_ALARM_ID]: 'aibolit-sync-alarm-id.json',
  [STORAGE_KEYS.RETRY_TICK_ALARM_ID]: 'aibolit-retry-tick-id.json',
  [STORAGE_KEYS.SNOOZE_ALARM_ID]: 'aibolit-snooze-id.json',
}

function getItem(key, defaultValue = null) {
  const value = storage.getItem(key)
  return value !== undefined ? value : defaultValue
}

function setItem(key, value) {
  storage.setItem(key, value)
}

function removeItem(key) {
  storage.removeItem(key)
}

function clear() {
  storage.clear()
}

function readFsValue(key) {
  const path = FS_FILE_NAMES[key]
  if (!path) return undefined
  try {
    const content = readFileSync({ path, options: { encoding: 'utf8' } })
    if (content === undefined || content === null || content === '') return undefined
    return JSON.parse(content)
  } catch (e) {
    return undefined
  }
}

function writeFsValue(key, value) {
  const path = FS_FILE_NAMES[key]
  if (!path) return
  try {
    writeFileSync({ path, data: JSON.stringify(value), options: { encoding: 'utf8' } })
  } catch (e) {
    // ignore
  }
}

function removeFsValue(key) {
  const path = FS_FILE_NAMES[key]
  if (!path) return
  try {
    rmSync({ path })
  } catch (e) {
    // ignore
  }
}

function getPersistent(key, defaultValue) {
  const fromFile = readFsValue(key)
  return fromFile !== undefined ? fromFile : getItem(key, defaultValue)
}

function setPersistent(key, value) {
  writeFsValue(key, value)
  setItem(key, value)
}

function removePersistent(key) {
  removeFsValue(key)
  removeItem(key)
}

export function getMedications() {
  const value = getItem(STORAGE_KEYS.MEDICATIONS, [])
  return Array.isArray(value) ? value : []
}

export function setMedications(medications) {
  setItem(STORAGE_KEYS.MEDICATIONS, medications)
}

export function getIntakes() {
  const value = getItem(STORAGE_KEYS.INTAKES, [])
  return Array.isArray(value) ? value : []
}

export function setIntakes(intakes) {
  setItem(STORAGE_KEYS.INTAKES, intakes)
}

export function getTakeLogs() {
  const value = getItem(STORAGE_KEYS.TAKE_LOGS, [])
  return Array.isArray(value) ? value : []
}

export function setTakeLogs(takeLogs) {
  setItem(STORAGE_KEYS.TAKE_LOGS, takeLogs)
}

export function addTakeLog(takeLog) {
  const takeLogs = getTakeLogs()
  takeLogs.push(takeLog)
  setTakeLogs(takeLogs)
  return takeLog
}

export function removeTakeLog(takeLogId) {
  const takeLogs = getTakeLogs()
  const filtered = takeLogs.filter(i => i.id !== takeLogId)
  setTakeLogs(filtered)
  return filtered
}

export function getCancellations() {
  const value = getItem(STORAGE_KEYS.CANCELLATIONS, [])
  return Array.isArray(value) ? value : []
}

export function setCancellations(cancellations) {
  setItem(STORAGE_KEYS.CANCELLATIONS, cancellations)
}

export function addCancellation(intakeId, date) {
  const cancellations = getCancellations()
  const existing = cancellations.find(c => c.intakeId === intakeId && c.date === date)
  if (!existing) {
    cancellations.push({ intakeId, date })
    setCancellations(cancellations)
  }
}

export function removeCancellation(intakeId, date) {
  const cancellations = getCancellations()
  const filtered = cancellations.filter(c => !(c.intakeId === intakeId && c.date === date))
  setCancellations(filtered)
}

export function isIntakeCancelled(intakeId, date) {
  const cancellations = getCancellations()
  return cancellations.some(c => c.intakeId === intakeId && c.date === date)
}

export function getSettings() {
  const settings = getItem(STORAGE_KEYS.SETTINGS, null)
  return settings && typeof settings === 'object' ? settings : { ...DEFAULT_SETTINGS }
}

export function setSettings(settings) {
  setItem(STORAGE_KEYS.SETTINGS, settings)
}

export function getSyncQueue() {
  const value = getItem(STORAGE_KEYS.SYNC_QUEUE, [])
  return Array.isArray(value) ? value : []
}

export function setSyncQueue(queue) {
  setItem(STORAGE_KEYS.SYNC_QUEUE, queue)
}

export function addToSyncQueue(record) {
  const queue = getSyncQueue()
  queue.push(record)
  setSyncQueue(queue)
}

export function clearSyncedItems(syncedIds) {
  const queue = getSyncQueue()
  const remaining = queue.filter(item => !syncedIds.includes(item.id))
  setSyncQueue(remaining)
}

export function getTodayDateStr() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getYesterdayDateStr() {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function pruneOldTakeLogs() {
  const today = getTodayDateStr()
  const yesterday = getYesterdayDateStr()
  const takeLogs = getTakeLogs()
  const filtered = takeLogs.filter(i => i.date === today || i.date === yesterday)
  setTakeLogs(filtered)
}

export function clearAll() {
  clear()
}

export function getConfigRevision() {
  const value = getItem(STORAGE_KEYS.CONFIG_REVISION, 0)
  return typeof value === 'number' && !isNaN(value) ? value : 0
}

export function setConfigRevision(revision) {
  setItem(STORAGE_KEYS.CONFIG_REVISION, revision)
}

export function getSyncAlarmId() {
  const value = getPersistent(STORAGE_KEYS.SYNC_ALARM_ID, null)
  return typeof value === 'number' ? value : null
}

export function setSyncAlarmId(id) {
  setPersistent(STORAGE_KEYS.SYNC_ALARM_ID, id)
}

export function clearSyncAlarmId() {
  removePersistent(STORAGE_KEYS.SYNC_ALARM_ID)
}

export function getSnoozeAlarmId() {
  const value = getPersistent(STORAGE_KEYS.SNOOZE_ALARM_ID, null)
  return typeof value === 'number' ? value : null
}

export function setSnoozeAlarmId(id) {
  setPersistent(STORAGE_KEYS.SNOOZE_ALARM_ID, id)
}

export function clearSnoozeAlarmId() {
  removePersistent(STORAGE_KEYS.SNOOZE_ALARM_ID)
}

export function getRetryTickAlarmId() {
  const value = getPersistent(STORAGE_KEYS.RETRY_TICK_ALARM_ID, null)
  return typeof value === 'number' ? value : null
}

export function setRetryTickAlarmId(id) {
  setPersistent(STORAGE_KEYS.RETRY_TICK_ALARM_ID, id)
}

export function getRetryTickCount() {
  const value = getItem('retryTickCount', 0)
  return typeof value === 'number' ? value : 0
}

export function setRetryTickCount(count) {
  setItem('retryTickCount', count)
}

function readDebugLogFile() {
  try {
    const content = readFileSync({ path: DEBUG_LOG_FILE, options: { encoding: 'utf8' } })
    if (content === undefined || content === null || content === '') return null
    const parsed = JSON.parse(content)
    return Array.isArray(parsed) ? parsed : null
  } catch (e) {
    return null
  }
}

function writeDebugLogFile(log) {
  try {
    writeFileSync({ path: DEBUG_LOG_FILE, data: JSON.stringify(log), options: { encoding: 'utf8' } })
  } catch (e) {
    // ignore
  }
}

export function getDebugLog() {
  const fromFile = readDebugLogFile()
  if (fromFile) return fromFile
  const value = getItem(STORAGE_KEYS.DEBUG_LOG, [])
  return Array.isArray(value) ? value : []
}

export function setDebugLog(log) {
  const normalized = Array.isArray(log) ? log : []
  writeDebugLogFile(normalized)
  setItem(STORAGE_KEYS.DEBUG_LOG, normalized)
}

export function getAlarmRegistry() {
  const value = getPersistent(STORAGE_KEYS.ALARM_REGISTRY, {})
  return value && typeof value === 'object' ? value : {}
}

export function setAlarmRegistry(registry) {
  setPersistent(STORAGE_KEYS.ALARM_REGISTRY, registry && typeof registry === 'object' ? registry : {})
}

export function registerAlarm(id, info) {
  if (id === null || id === undefined) return
  const registry = getAlarmRegistry()
  registry[id] = info
  setAlarmRegistry(registry)
}

export function unregisterAlarm(id) {
  if (id === null || id === undefined) return
  const registry = getAlarmRegistry()
  if (registry[id] !== undefined) {
    delete registry[id]
    setAlarmRegistry(registry)
  }
}

function readPendingFile() {
  try {
    const content = readFileSync({ path: PENDING_FILE, options: { encoding: 'utf8' } })
    if (content === undefined || content === null || content === '') return null
    const parsed = JSON.parse(content)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch (e) {
    return null
  }
}

function writePendingFile(pending) {
  try {
    writeFileSync({ path: PENDING_FILE, data: JSON.stringify(pending), options: { encoding: 'utf8' } })
  } catch (e) {
    // ignore
  }
}

function removePendingFile() {
  try {
    rmSync({ path: PENDING_FILE })
  } catch (e) {
    // ignore
  }
}

export function getPendingNotification() {
  const fromFile = readPendingFile()
  if (fromFile) return fromFile
  const value = getItem(STORAGE_KEYS.PENDING_NOTIFICATION, null)
  return value && typeof value === 'object' ? value : null
}

export function setPendingNotification(pending) {
  writePendingFile(pending)
  setItem(STORAGE_KEYS.PENDING_NOTIFICATION, pending)
}

export function clearPendingNotification() {
  removePendingFile()
  removeItem(STORAGE_KEYS.PENDING_NOTIFICATION)
}
