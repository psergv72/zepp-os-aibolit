import { fetchConfigFromSide } from './watch-config'
import { fetchTakesFromPhone, mergeTakeRecords } from './sync'
import { refreshAlarms } from './schedule'
import { getTodayDateStr } from './storage'

export function syncFromPhone(source = '') {
  return fetchConfigFromSide(source)
    .then((applied) => {
      if (applied) refreshAlarms()
      return fetchTakesFromPhone(getTodayDateStr()).then((records) => {
        mergeTakeRecords(records)
      })
    })
    .catch(() => {})
}
