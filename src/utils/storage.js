import { AsyncStorage, Storage } from '@silver-zepp/easy-storage'
import { parseNdJson } from './ndjson.js'
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants'

const pendingCache = new Map()

const FS_FILE_NAMES = {
  [STORAGE_KEYS.MEDICATIONS]: 'aibolit-key-medications.json',
  [STORAGE_KEYS.INTAKES]: 'aibolit-key-intakes.json',
  [STORAGE_KEYS.TAKE_LOGS]: 'aibolit-key-take-logs.json',
  [STORAGE_KEYS.CANCELLATIONS]: 'aibolit-key-cancellations.json',
  [STORAGE_KEYS.SETTINGS]: 'aibolit-key-settings.json',
  [STORAGE_KEYS.SYNC_QUEUE]: 'aibolit-key-sync-queue.json',
  [STORAGE_KEYS.CONFIG_REVISION]: 'aibolit-key-config-revision.json',
  [STORAGE_KEYS.SYNC_ALARM_ID]: 'aibolit-key-sync-alarm-id.json',
  [STORAGE_KEYS.SNOOZE_ALARM_ID]: 'aibolit-key-snooze-id.json',
  [STORAGE_KEYS.RETRY_TICK_ALARM_ID]: 'aibolit-key-retry-tick-id.json',
  [STORAGE_KEYS.ALARM_REGISTRY]: 'aibolit-key-alarm-registry.json',
  [STORAGE_KEYS.PENDING_NOTIFICATION]: 'aibolit-pending.json',
  [STORAGE_KEYS.DEBUG_LOG]: 'aibolit-debuglog.json',
  retryTickCount: 'aibolit-key-retry-tick-count.json',
}

function readKeyFile(path, key) {
  try {
    const content = Storage.ReadFile(path)
    if (!content) return undefined
    const parsed = parseNdJson(content)
    if (parsed === undefined || parsed === null) return undefined
    return parsed[key]
  } catch (e) {
    return undefined
  }
}

export function getItem(key, defaultValue = null) {
  if (pendingCache.has(key)) return pendingCache.get(key)
  const path = FS_FILE_NAMES[key]
  if (path) {
    const fromFile = readKeyFile(path, key)
    if (fromFile !== undefined) return fromFile
  }
  return defaultValue
}

export function setItem(key, value) {
  pendingCache.set(key, value)
  const path = FS_FILE_NAMES[key]
  if (path) AsyncStorage.WriteJson(path, { [key]: value })
}

export function removeItem(key) {
  pendingCache.delete(key)
  const path = FS_FILE_NAMES[key]
  if (path) Storage.RemoveFile(path)
}

export function clear() {
  pendingCache.clear()
  for (const path of Object.values(FS_FILE_NAMES)) {
    Storage.RemoveFile(path)
  }
}

export function saveAndQuit() {
  return AsyncStorage.SaveAndQuit()
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
  const value = getItem(STORAGE_KEYS.SYNC_ALARM_ID, null)
  return typeof value === 'number' ? value : null
}

export function setSyncAlarmId(id) {
  setItem(STORAGE_KEYS.SYNC_ALARM_ID, id)
}

export function clearSyncAlarmId() {
  removeItem(STORAGE_KEYS.SYNC_ALARM_ID)
}

export function getSnoozeAlarmId() {
  const value = getItem(STORAGE_KEYS.SNOOZE_ALARM_ID, null)
  return typeof value === 'number' ? value : null
}

export function setSnoozeAlarmId(id) {
  setItem(STORAGE_KEYS.SNOOZE_ALARM_ID, id)
}

export function clearSnoozeAlarmId() {
  removeItem(STORAGE_KEYS.SNOOZE_ALARM_ID)
}

export function getRetryTickAlarmId() {
  const value = getItem(STORAGE_KEYS.RETRY_TICK_ALARM_ID, null)
  return typeof value === 'number' ? value : null
}

export function setRetryTickAlarmId(id) {
  setItem(STORAGE_KEYS.RETRY_TICK_ALARM_ID, id)
}

export function getRetryTickCount() {
  const value = getItem('retryTickCount', 0)
  return typeof value === 'number' ? value : 0
}

export function setRetryTickCount(count) {
  setItem('retryTickCount', count)
}

export function getDebugLog() {
  const value = getItem(STORAGE_KEYS.DEBUG_LOG, [])
  return Array.isArray(value) ? value : []
}

export function setDebugLog(log) {
  const normalized = Array.isArray(log) ? log : []
  setItem(STORAGE_KEYS.DEBUG_LOG, normalized)
}

export function getAlarmRegistry() {
  const value = getItem(STORAGE_KEYS.ALARM_REGISTRY, {})
  return value && typeof value === 'object' ? value : {}
}

export function setAlarmRegistry(registry) {
  setItem(STORAGE_KEYS.ALARM_REGISTRY, registry && typeof registry === 'object' ? registry : {})
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

export function getPendingNotification() {
  const value = getItem(STORAGE_KEYS.PENDING_NOTIFICATION, null)
  return value && typeof value === 'object' ? value : null
}

export function setPendingNotification(pending) {
  setItem(STORAGE_KEYS.PENDING_NOTIFICATION, pending)
}

export function clearPendingNotification() {
  removeItem(STORAGE_KEYS.PENDING_NOTIFICATION)
}
