import { BaseApp } from '@zeppos/zml/base-app'
import { appPlugin } from '@zeppos/zml/3.0/module/messaging/plugin/app'
import { log as Logger } from '@zos/utils'
import { refreshAlarms } from './utils/schedule'
import { applyConfigFromSettings } from './utils/watch-config'
import { ZML_METHODS } from './utils/constants'
import { initSync, retrySync } from './utils/sync'
import { syncFromPhone } from './utils/sync-all'
import { pushDebugSnapshot, addDebugEntry, clearDebugLog } from './utils/debug-log'
import { saveAndQuit } from './utils/storage'

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
      const runSync = () => {
        refreshAlarms()
        syncFromPhone('при старте')
      }
      if (typeof setTimeout === 'function') {
        setTimeout(runSync, 0)
      } else {
        runSync()
      }
    },
    onCall(data) {
      logger.log(`app onCall method: ${data && data.method}`)
      if (data && data.method === ZML_METHODS.CONFIG_SYNCED) {
        addDebugEntry('получено уведомление об изменении настроек с телефона')
        syncFromPhone('уведомление')
      }
      if (data && data.method === ZML_METHODS.REQUEST_DEBUG) {
        pushDebugSnapshot()
      }
      if (data && data.method === ZML_METHODS.CLEAR_DEBUG) {
        clearDebugLog()
      }
    },
    onDestroy() {
      logger.log('app onDestroy invoked')
      saveAndQuit()
    }
  })
)
