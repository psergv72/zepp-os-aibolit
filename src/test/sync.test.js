import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const storage = await import('./helpers/stubs/zos-storage.mjs')
const { initSync, retrySync, sendTakeLogToPhone, sendCancellationToPhone, fetchTakesFromPhone, mergeTakeRecords } = await import('../utils/sync.js')

function seed() {
  storage.__resetStorage()
  new storage.ShareLocalStorage('aibolit-data.json')
}

beforeEach(() => {
  seed()
  initSync(null)
})

test('sendTakeLogToPhone отправляет записи на телефон через request после initSync', async () => {
  const sent = []
  const fakeSide = {
    request(payload) {
      sent.push(payload)
      return Promise.resolve({ success: true, count: 1 })
    },
  }
  initSync(fakeSide)

  sendTakeLogToPhone({ id: 'log_1', intakeId: 'i1', status: 'taken' })
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(sent.length, 1)
  assert.equal(sent[0].method, 'sync_intake')
  assert.equal(sent[0].params.records.length, 1)
  assert.equal(sent[0].params.records[0].intakeId, 'i1')
})

test('sendTakeLogToPhone убирает из очереди успешно отправленные записи', async () => {
  const fakeSide = {
    request(payload) {
      return Promise.resolve({ success: true, count: payload.params.records.length })
    },
  }
  initSync(fakeSide)

  sendTakeLogToPhone({ id: 'log_1', intakeId: 'i1', status: 'taken' })
  await new Promise((resolve) => setTimeout(resolve, 0))

  const queue = storage.__stores().get('aibolit-data.json').get('syncQueue')
  assert.ok(queue, 'syncQueue существует')
  assert.equal(queue.length, 0)
})

test('два sendTakeLogToPhone подряд не дублируют записи в одном payload', async () => {
  const sent = []
  const fakeSide = {
    request(payload) {
      sent.push(payload)
      return Promise.resolve({ success: true, count: payload.params.records.length })
    },
  }
  initSync(fakeSide)

  sendTakeLogToPhone({ id: 'log_1', intakeId: 'i1', status: 'taken' })
  sendTakeLogToPhone({ id: 'log_2', intakeId: 'i2', status: 'taken' })
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(sent.length, 2)
  const first = sent[0].params.records.map(r => r.id)
  const second = sent[1].params.records.map(r => r.id)
  assert.deepEqual([...first, ...second].sort(), ['log_1', 'log_2'])
})

test('sendTakeLogToPhone не вызывает request до initSync', async () => {
  const sent = []
  const fakeSide = {
    request(payload) {
      sent.push(payload)
      return Promise.resolve()
    },
  }

  sendTakeLogToPhone({ id: 'log_1', intakeId: 'i1', status: 'taken' })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(sent.length, 0)
})

test('retrySync отправляет накопленные записи из очереди', async () => {
  const sent = []
  const fakeSide = {
    request(payload) {
      sent.push(payload)
      return Promise.resolve({ success: true, count: payload.params.records.length })
    },
  }
  initSync(fakeSide)
  storage.__stores().get('aibolit-data.json').set('syncQueue', [
    { id: 'log_q', intakeId: 'i1', status: 'taken' },
  ])

  retrySync()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(sent.length, 1)
  assert.equal(sent[0].method, 'sync_intake')
  assert.equal(sent[0].params.records.length, 1)
  assert.equal(sent[0].params.records[0].id, 'log_q')
})

test('fetchTakesFromPhone возвращает записи из request', async () => {
  const fakeSide = {
    request(payload) {
      assert.equal(payload.method, 'get_take_logs')
      assert.equal(payload.params.date, '2026-08-05')
      return Promise.resolve({ records: [{ id: 'log_x', intakeId: 'i1', status: 'taken' }] })
    },
  }
  initSync(fakeSide)

  const records = await fetchTakesFromPhone('2026-08-05')
  assert.equal(records.length, 1)
  assert.equal(records[0].id, 'log_x')
})

test('fetchTakesFromPhone возвращает пустой список до initSync', async () => {
  initSync(null)
  const records = await fetchTakesFromPhone('2026-08-05')
  assert.deepEqual(records, [])
})

test('fetchTakesFromPhone использует messaging из getApp() без initSync', async () => {
  const sent = []
  globalThis.getApp = () => ({
    _options: {
      globalData: {
        messaging: {
          request(payload) {
            sent.push(payload)
            return Promise.resolve({ records: [{ id: 'log_g', intakeId: 'i1', status: 'taken' }] })
          },
        },
      },
    },
  })
  initSync(null)

  const records = await fetchTakesFromPhone('2026-08-05')

  assert.equal(records.length, 1)
  assert.equal(records[0].id, 'log_g')
  assert.equal(sent[0].method, 'get_take_logs')
  delete globalThis.getApp
})

test('mergeTakeRecords добавляет только новые записи taken', () => {
  storage.__stores().get('aibolit-data.json').set('takeLogs', [
    { id: 'log_1', intakeId: 'i1', status: 'taken' },
  ])

  const changed = mergeTakeRecords([
    { id: 'log_1', intakeId: 'i1', status: 'taken' },
    { id: 'log_2', intakeId: 'i2', status: 'taken' },
    { id: 'log_3', intakeId: 'i3', status: 'cancelled' },
  ])

  assert.equal(changed, true)
  const logs = storage.__stores().get('aibolit-data.json').get('takeLogs')
  assert.equal(logs.length, 2)
  assert.ok(logs.some(i => i.id === 'log_2'))
  assert.ok(!logs.some(i => i.id === 'log_3'))
})

test('mergeTakeRecords не меняет ничего при пустом списке', () => {
  assert.equal(mergeTakeRecords([]), false)
  assert.equal(mergeTakeRecords(null), false)
})

test('sendCancellationToPhone встаёт в очередь и уходит через sync_intake со status cancelled', async () => {
  const sent = []
  const fakeSide = {
    request(payload) {
      sent.push(payload)
      return Promise.resolve({ success: true, count: payload.params.records.length })
    },
  }
  initSync(fakeSide)

  sendCancellationToPhone('i1', '2026-08-05')
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(sent.length, 1)
  assert.equal(sent[0].method, 'sync_intake')
  assert.equal(sent[0].params.records.length, 1)
  assert.equal(sent[0].params.records[0].intakeId, 'i1')
  assert.equal(sent[0].params.records[0].date, '2026-08-05')
  assert.equal(sent[0].params.records[0].status, 'cancelled')
})

test('при неудачной отправке записи остаются в очереди и доезжают при retrySync', async () => {
  let fail = true
  const sent = []
  const fakeSide = {
    request(payload) {
      sent.push(payload)
      return fail ? Promise.reject(new Error('ble down')) : Promise.resolve({ success: true, count: payload.params.records.length })
    },
  }
  initSync(fakeSide)

  sendTakeLogToPhone({ id: 'log_1', intakeId: 'i1', status: 'taken' })
  await new Promise((resolve) => setTimeout(resolve, 0))

  const queueAfterFail = storage.__stores().get('aibolit-data.json').get('syncQueue')
  assert.ok(queueAfterFail, 'syncQueue существует')
  assert.equal(queueAfterFail.length, 1, 'записи остаются в очереди после неудачи')
  assert.equal(sent.length, 1)

  fail = false
  retrySync()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(sent.length, 2)
  assert.equal(sent[1].params.records.length, 1)
  assert.equal(sent[1].params.records[0].id, 'log_1')
  const queueAfterRetry = storage.__stores().get('aibolit-data.json').get('syncQueue')
  assert.equal(queueAfterRetry.length, 0, 'очередь очищена после успешного retry')
})
