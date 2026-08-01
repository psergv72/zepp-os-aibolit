import { ZML_METHODS } from './constants'
import { setMedications, setIntakes, setSettings } from './storage'
import { parseSettingsItem } from './config-sync'

export function getMessaging() {
  try {
    const app = getApp()
    return app && app._options && app._options.globalData && app._options.globalData.messaging
  } catch (e) {
    return null
  }
}

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
  if (Array.isArray(config.medications)) setMedications(config.medications)
  if (Array.isArray(config.intakes)) setIntakes(config.intakes)
  if (config.settings && typeof config.settings === 'object') setSettings(config.settings)
  return true
}

export function applyConfigFromSettings() {
  const storage = getSettingsStorage()
  if (!storage) return false

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
    }
  }

  return applied
}

export function fetchConfigFromSide(maxAttempts = 6, delayMs = 1000) {
  return new Promise((resolve) => {
    if (applyConfigFromSettings()) {
      resolve(true)
      return
    }

    const attempt = (n) => {
      const messaging = getMessaging()
      if (!messaging || typeof messaging.request !== 'function') {
        if (n > 0) {
          setTimeout(() => attempt(n - 1), delayMs)
          return
        }
        resolve(false)
        return
      }
      messaging.request({ method: ZML_METHODS.GET_CONFIG })
        .then((result) => {
          applyConfigToStorage(result && result.config)
          resolve(!!(result && result.config))
        })
        .catch(() => {
          if (n > 0) {
            setTimeout(() => attempt(n - 1), delayMs)
            return
          }
          resolve(false)
        })
    }
    attempt(maxAttempts)
  })
}
