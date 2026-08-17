import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const storage = await import('./helpers/stubs/zos-storage.mjs')
const fs = await import('./helpers/stubs/zos-fs.mjs')
const alarm = await import('./helpers/stubs/zos-alarm.mjs')
const { initSync } = await import('../utils/sync.js')
const { syncFromPhone } = await import('../utils/sync-all.js')

function seed() {
  storage.__resetStorage()
  fs.__resetFs()
  new storage.LocalStorage('aibolit-data.json')
  const meds = [{ id: 'm1', name: 'Аспирин', enabled: true }]
  const intakes = [{ id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] }]
  storage.__stores().get('aibolit-data.json').set('medications', meds)
  storage.__stores().get('aibolit-data.json').set('intakes', intakes)
}

beforeEach(() => {
  seed()
  initSync(null)
  alarm.__reset()
})

function fakeSideWith(sent, revision, hasRecords) {
  return {
    request(payload) {
      sent.push(payload)
      if (payload.method === 'get_config') {
        return Promise.resolve({
          config: {
            revision,
            medications: [{ id: 'm1', name: 'Аспирин', enabled: true }],
            intakes: [{ id: 'i1', time: '08:00', weekDays: null, items: [{ medicationId: 'm1', amount: '1' }] }],
            settings: { minFontSize: 16 },
          },
        })
      }
      if (payload.method === 'get_take_logs') {
        return Promise.resolve({ records: hasRecords ? [{ id: 'log_x', intakeId: 'i1', date: '2026-08-17', status: 'taken' }] : [] })
      }
      return Promise.resolve({ success: true, count: 0 })
    },
  }
}

test('syncFromPhone запрашивает get_config и get_take_logs', async () => {
  const sent = []
  initSync(fakeSideWith(sent, 9, false))

  await syncFromPhone('при старте')

  assert.ok(sent.some(p => p.method === 'get_config'))
  assert.ok(sent.some(p => p.method === 'get_take_logs'))
})

test('syncFromPhone при применённом конфиге перестраивает будильники', async () => {
  const sent = []
  initSync(fakeSideWith(sent, 9, false))

  await syncFromPhone('при старте')

  const sets = alarm.__getCalls().filter(c => c.method === 'set')
  assert.ok(sets.length > 0, 'refreshAlarms должен создать будильники')
  assert.ok(sets.some(c => JSON.parse(c.option.param).mode === 'sync'), 'создан sync-alarm')
})

test('syncFromPhone не перестраивает будильники, когда конфиг не применён', async () => {
  const store = storage.__stores().get('aibolit-data.json')
  store.set('configRevision', 10)
  const sent = []
  initSync(fakeSideWith(sent, 9, false))

  await syncFromPhone('при старте')

  assert.equal(alarm.__getCalls().length, 0, 'refreshAlarms не вызывается при нетронутом конфиге')
})

test('syncFromPhone применяет take-логи с телефона', async () => {
  const sent = []
  initSync(fakeSideWith(sent, 9, true))

  await syncFromPhone('при старте')

  const logs = storage.__stores().get('aibolit-data.json').get('takeLogs')
  assert.ok(logs.some(i => i.id === 'log_x'))
})

test('syncFromPhone не бросает исключений при обрыве связи', async () => {
  initSync({
    request() {
      throw new Error('ble down')
    },
  })

  const result = await syncFromPhone('при старте')
  assert.equal(result, undefined)
})
