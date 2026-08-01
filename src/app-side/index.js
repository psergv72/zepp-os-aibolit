import { BaseSideService } from '@zeppos/zml/base-side'
import { ShareLocalStorage } from '@zos/storage'
import { ZML_METHODS } from '../utils/constants'
import { CONFIG_KEYS, parseSettingsItem } from '../utils/config-sync'

const configStorage = new ShareLocalStorage('aibolit-data.json')

AppSideService(
  BaseSideService({
    onInit() {
      console.log('Side Service onInit')
    },

    onRun() {
      console.log('Side Service onRun')
      this.pushConfigToWatch()
    },

    onDestroy() {
      console.log('Side Service onDestroy')
    },

    onSettingsChange({ key }) {
      console.log(`onSettingsChange key: ${key}`)
      if (CONFIG_KEYS.includes(key)) {
        this.pushConfigToWatch()
      }
    },

    pushConfigToWatch() {
      for (const key of CONFIG_KEYS) {
        const raw = this.settings.getItem(key)
        const value = parseSettingsItem(raw)
        if (value !== null) {
          configStorage.setItem(key, value)
        }
      }
      try {
        this.call({ method: ZML_METHODS.CONFIG_SYNCED, params: {} })
      } catch (error) {
        console.log(`Config sync notify failed: ${error}`)
      }
      console.log('Config pushed to watch storage')
    },

    onRequest(req, res) {
      console.log(`onRequest method: ${req.method}`)

      if (req.method === ZML_METHODS.SYNC_INTAKE) {
        const { records } = req.params
        if (records && records.length > 0) {
          for (const record of records) {
            const dateKey = `history_${record.date}`
            const existing = settings.settingsStorage.getItem(dateKey)
            const history = existing ? JSON.parse(existing) : []
            history.push(record)
            settings.settingsStorage.setItem(dateKey, JSON.stringify(history))
          }
          res(null, { success: true, count: records.length })
        } else {
          res(null, { success: true, count: 0 })
        }
        return
      }

      if (req.method === ZML_METHODS.SYNC_CANCELLATION) {
        const { intakeId, date } = req.params
        const dateKey = `history_${date}`
        const existing = settings.settingsStorage.getItem(dateKey)
        const history = existing ? JSON.parse(existing) : []
        history.push({
          intakeId,
          date,
          status: 'cancelled',
          syncedAt: new Date().toISOString(),
        })
        settings.settingsStorage.setItem(dateKey, JSON.stringify(history))
        res(null, { success: true })
        return
      }

      res('unknown method', null)
    },

    onCall(data) {
      console.log(`onCall method: ${data.method}`)
    },
  })
)
