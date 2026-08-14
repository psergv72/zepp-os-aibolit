import { ZML_METHODS, STORAGE_KEYS } from './constants'
import { setMedications, setIntakes, setSettings, getConfigRevision, setConfigRevision } from './storage'
import { parseSettingsItem } from './config-sync'
import { addDebugEntry } from './debug-log'
import { getMessaging } from './sync'

export function getSettingsStorage() {
  try {
    if (typeof settings !== 'undefined' && settings && settings.settingsStorage) {
      return settings.settingsStorage
    }
  } catch (e) {
    return null
  }
  return null
}

export function applyConfigToStorage(config) {
  if (!config) return false
  if (typeof config.revision !== 'number') return false
  if (config.revision <= getConfigRevision()) {
    addDebugEntry(`настройки с телефона пропущены: ревизия ${config.revision} не новее текущей`)
    return false
  }
  if (Array.isArray(config.medications)) setMedications(config.medications)
  if (Array.isArray(config.intakes)) setIntakes(config.intakes)
  if (config.settings && typeof config.settings === 'object') setSettings(config.settings)
  setConfigRevision(config.revision)
  addDebugEntry(`настройки с телефона применены (ревизия ${config.revision})`)
  return true
}

export function applyConfigFromSettings() {
  const storage = getSettingsStorage()
  if (!storage) return false

  const revisionRaw = storage.getItem(STORAGE_KEYS.CONFIG_REVISION)
  const revision = parseSettingsItem(revisionRaw)
  if (typeof revision !== 'number') return false
  if (revision <= getConfigRevision()) {
    addDebugEntry(`настройки из settingsStorage пропущены: ревизия ${revision} не новее текущей`)
    return false
  }

  let applied = false

  const medsRaw = storage.getItem('medications')
  if (medsRaw !== null && medsRaw !== undefined) {
    const value = parseSettingsItem(medsRaw)
    if (Array.isArray(value)) {
      setMedications(value)
      applied = true
    }
  }

  const intakesRaw = storage.getItem('intakes')
  if (intakesRaw !== null && intakesRaw !== undefined) {
    const value = parseSettingsItem(intakesRaw)
    if (Array.isArray(value)) {
      setIntakes(value)
      applied = true
    }
  }

  const settingsRaw = storage.getItem('settings')
  if (settingsRaw !== null && settingsRaw !== undefined) {
    const value = parseSettingsItem(settingsRaw)
    if (value && typeof value === 'object') {
      setSettings(value)
      applied = true
    }
  }

  if (applied) {
    setConfigRevision(revision)
    addDebugEntry(`настройки из settingsStorage применены (ревизия ${revision})`)
  }
  return applied
}

export function fetchConfigFromSide(source = '', maxAttempts = 6, delayMs = 1000) {
  return new Promise((resolve) => {
    if (applyConfigFromSettings()) {
      resolve(true)
      return
    }

    const attempt = (n) => {
      const messaging = getMessaging()
      if (!messaging || typeof messaging.request !== 'function') {
        if (n > 0 && typeof setTimeout === 'function') {
          setTimeout(() => attempt(n - 1), delayMs)
          return
        }
        addDebugEntry('не удалось получить настройки с телефона: нет соединения')
        resolve(false)
        return
      }
      addDebugEntry(`запрос настроек с телефона (${source ? source + ', ' : ''}попытка ${maxAttempts - n + 1})`)
      messaging.request({ method: ZML_METHODS.GET_CONFIG })
        .then((result) => {
          applyConfigToStorage(result && result.config)
          resolve(!!(result && result.config))
        })
        .catch(() => {
          if (n > 0 && typeof setTimeout === 'function') {
            addDebugEntry(`не удалось получить настройки с телефона (осталось попыток: ${n})`)
            setTimeout(() => attempt(n - 1), delayMs)
            return
          }
          addDebugEntry('не удалось получить настройки с телефона: попытки исчерпаны')
          resolve(false)
        })
    }
    attempt(maxAttempts)
  })
}
