export const CONFIG_KEYS = ['medications', 'intakes', 'settings']

export function parseSettingsItem(value) {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch (e) {
    return null
  }
}
