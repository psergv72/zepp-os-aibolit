import { ShareLocalStorage } from '@zos/storage'
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants'

const storage = new ShareLocalStorage('aibolit-data.json')

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
  return getItem(STORAGE_KEYS.MEDICATIONS, [])
}

export function setMedications(medications) {
  setItem(STORAGE_KEYS.MEDICATIONS, medications)
}

export function getIntakes() {
  return getItem(STORAGE_KEYS.INTAKES, [])
}

export function setIntakes(intakes) {
  setItem(STORAGE_KEYS.INTAKES, intakes)
}

export function getTakeLogs() {
  return getItem(STORAGE_KEYS.TAKE_LOGS, [])
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
  return getItem(STORAGE_KEYS.CANCELLATIONS, [])
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
  return settings || { ...DEFAULT_SETTINGS }
}

export function setSettings(settings) {
  setItem(STORAGE_KEYS.SETTINGS, settings)
}

export function getSyncQueue() {
  return getItem(STORAGE_KEYS.SYNC_QUEUE, [])
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
