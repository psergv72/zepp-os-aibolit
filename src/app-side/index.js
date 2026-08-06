import { BaseSideService } from '@zeppos/zml/base-side'
import { ZML_METHODS } from '../utils/constants'
import { CONFIG_KEYS, parseSettingsItem } from '../utils/config-sync'

AppSideService(
  BaseSideService({
    onInit() {
      console.log('Side Service onInit')
    },

    onRun() {
      console.log('Side Service onRun')
      this.ensureConfigRevision()
      this.pushConfigToWatch()
    },

    onDestroy() {
      console.log('Side Service onDestroy')
    },

    onSettingsChange({ key }) {
      console.log(`onSettingsChange key: ${key}`)
      if (CONFIG_KEYS.includes(key)) {
        this.bumpConfigRevision()
        this.pushConfigToWatch()
      }
    },

    bumpConfigRevision() {
      const current = parseSettingsItem(this.settings.getItem('configRevision')) || 0
      const next = (typeof current === 'number' ? current : 0) + 1
      this.settings.setItem('configRevision', next)
    },

    ensureConfigRevision() {
      const current = parseSettingsItem(this.settings.getItem('configRevision'))
      if (current === null || current === undefined) {
        this.settings.setItem('configRevision', 1)
      }
    },

    buildConfig() {
      const config = {}
      for (const key of CONFIG_KEYS) {
        const raw = this.settings.getItem(key)
        const value = parseSettingsItem(raw)
        if (value !== null) {
          config[key] = value
        }
      }
      const revision = parseSettingsItem(this.settings.getItem('configRevision')) || 0
      config.revision = typeof revision === 'number' ? revision : 0
      return config
    },

    pushConfigToWatch() {
      const config = this.buildConfig()
      try {
        this.call({ method: ZML_METHODS.CONFIG_SYNCED, params: { config } })
      } catch (error) {
        console.log(`Config sync notify failed: ${error}`)
      }
      console.log('Config pushed to watch')
    },

    onRequest(req, res) {
      console.log(`onRequest method: ${req.method}`)

      if (req.method === ZML_METHODS.GET_CONFIG) {
        res(null, { config: this.buildConfig() })
        return
      }

      if (req.method === ZML_METHODS.GET_TAKE_LOGS) {
        const { date } = req.params || {}
        const dateKey = `history_${date}`
        const existing = settings.settingsStorage.getItem(dateKey)
        const records = existing ? JSON.parse(existing) : []
        res(null, { records })
        return
      }

      if (req.method === ZML_METHODS.SYNC_INTAKE) {
        const { records } = req.params
        if (records && records.length > 0) {
          for (const record of records) {
            if (!record || !record.id) continue
            const dateKey = `history_${record.date}`
            const existing = settings.settingsStorage.getItem(dateKey)
            const history = existing ? JSON.parse(existing) : []
            const idx = history.findIndex(r => r.id === record.id)
            if (idx >= 0) {
              history[idx] = record
            } else {
              const conflictIdx = history.findIndex(r => r.intakeId === record.intakeId && r.date === record.date)
              if (conflictIdx >= 0) {
                history[conflictIdx] = record
              } else {
                history.push(record)
              }
            }
            settings.settingsStorage.setItem(dateKey, JSON.stringify(history))
          }
          res(null, { success: true, count: records.length })
        } else {
          res(null, { success: true, count: 0 })
        }
        return
      }

      res('unknown method', null)
    },

    onCall(data) {
      console.log(`onCall method: ${data.method}`)
    },
  })
)
