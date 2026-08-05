import { BaseApp } from '@zeppos/zml/base-app'
import { appPlugin } from '@zeppos/zml/3.0/module/messaging/plugin/app'
import { log as Logger } from '@zos/utils'
import { refreshAlarms } from './utils/schedule'
import { applyConfigToStorage, applyConfigFromSettings } from './utils/watch-config'
import { ZML_METHODS } from './utils/constants'
import { initSync, retrySync } from './utils/sync'

const logger = Logger.getLogger('aibolit-app')

BaseApp.use(appPlugin)

App(
  BaseApp({
    globalData: {},
    onCreate() {
      logger.log('app onCreate invoked')
      initSync(this.globalData && this.globalData.messaging)
      retrySync()
      if (applyConfigFromSettings()) {
        logger.log('config applied from settings on create')
      }
      this.syncConfig()
      refreshAlarms()
    },
    onCall(data) {
      logger.log(`app onCall method: ${data && data.method}`)
      if (data && data.method === ZML_METHODS.CONFIG_SYNCED) {
        applyConfigToStorage(data.params && data.params.config)
        refreshAlarms()
      }
    },
    syncConfig(attempt = 0) {
      this.request({ method: ZML_METHODS.GET_CONFIG })
        .then((result) => {
          logger.log('app syncConfig result received')
          applyConfigToStorage(result && result.config)
          refreshAlarms()
        })
        .catch((error) => {
          logger.log(`app syncConfig failed: ${error}`)
          if (attempt < 5) {
            setTimeout(() => this.syncConfig(attempt + 1), 1000)
          }
        })
    },
    onDestroy() {
      logger.log('app onDestroy invoked')
    }
  })
)
