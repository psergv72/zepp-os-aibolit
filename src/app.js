import { BaseApp } from '@zeppos/zml/base-app'
import { log as Logger } from '@zos/utils'
import { refreshAlarms } from './utils/schedule'
import { ZML_METHODS } from './utils/constants'

const logger = Logger.getLogger('aibolit-app')

App(
  BaseApp({
    globalData: {},
    onCreate() {
      logger.log('app onCreate invoked')
      refreshAlarms()
    },
    onCall(data) {
      logger.log(`app onCall method: ${data && data.method}`)
      if (data && data.method === ZML_METHODS.CONFIG_SYNCED) {
        refreshAlarms()
      }
    },
    onDestroy() {
      logger.log('app onDestroy invoked')
    }
  })
)
