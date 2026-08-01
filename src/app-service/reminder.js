import { log as Logger } from '@zos/utils'
import { notify } from '@zos/notification'
import { getSettings, getIntakes, getMedications, getTakeLogs, isIntakeCancelled, getTodayDateStr } from '../utils/storage'
import { createRetryAlarm } from '../utils/schedule'
import { ALARM_MODES } from '../utils/constants'

const logger = Logger.getLogger('aibolit-reminder')

function buildContent(intake) {
  const medications = getMedications()
  const lines = []
  for (const item of intake.items || []) {
    const med = medications.find(m => m.id === item.medicationId)
    if (!med || !med.enabled) continue
    lines.push((med.name || '') + (item.amount ? ' \u00d7 ' + item.amount : ''))
  }
  return lines.join(', ') || 'Примите лекарство'
}

AppService({
  onEvent(e) {
    logger.log('reminder onEvent: ' + e)

    let params
    try {
      params = JSON.parse(e)
    } catch (err) {
      logger.log('Failed to parse event params: ' + e)
      return
    }

    const { mode, intakeId } = params
    if (!intakeId) return

    const intake = getIntakes().find(i => i.id === intakeId)
    if (!intake) return

    const todayDateStr = getTodayDateStr()

    if (isIntakeCancelled(intakeId, todayDateStr)) return

    const takeLogs = getTakeLogs()
    const alreadyTaken = takeLogs.some(i => i.intakeId === intakeId && i.date === todayDateStr && i.status === 'taken')
    if (alreadyTaken) return

    const title = intake.label || intake.time
    const content = buildContent(intake)

    notify({
      title: title,
      content: content,
      vibrate: 1,
      actions: [
        {
          text: 'Принял',
          file: 'app-service/take',
          param: JSON.stringify({ intakeId }),
        },
        {
          text: 'Отложить',
          file: 'page/snooze/index',
          param: JSON.stringify({ intakeId }),
        },
      ],
    })

    if (mode === ALARM_MODES.REMINDER) {
      const settings = getSettings()
      createRetryAlarm(intakeId, settings.retryInterval)
    }

    logger.log('Notification sent for ' + title)
  },

  onInit(e) {
    logger.log('reminder onInit(' + e + ')')
  },

  onDestroy() {
    logger.log('reminder onDestroy')
  },
})
