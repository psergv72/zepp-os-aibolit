import { ShareLocalStorage } from '@zos/storage'
import { readFileSync, writeFileSync, rmSync } from '@zos/fs'
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants'

const storage = new ShareLocalStorage('aibolit-data.json')
const PENDING_FILE = 'aibolit-pending.json'

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
