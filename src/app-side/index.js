import { BaseSideService } from '@zeppos/zml/base-side'
import { log as Logger } from '@zos/utils'
import { ZML_METHODS } from '../utils/constants'

const logger = Logger.getLogger('aibolit-side')

AppSideService(
  BaseSideService({
    onInit() {
      logger.log('Side Service onInit')
    },

    onRun() {
      logger.log('Side Service onRun')
    },

    onDestroy() {
      logger.log('Side Service onDestroy')
    },

    onRequest(req, res) {
      logger.log(`onRequest method: ${req.method}`)

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
        const { scheduleId, date } = req.params
        const dateKey = `history_${date}`
        const existing = settings.settingsStorage.getItem(dateKey)
        const history = existing ? JSON.parse(existing) : []
        history.push({
          scheduleId,
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
      logger.log(`onCall method: ${data.method}`)
    },
  })
)
