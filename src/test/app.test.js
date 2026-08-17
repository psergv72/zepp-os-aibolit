import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let appOpts = null
globalThis.App = (opts) => { appOpts = opts }

const storage = await import('./helpers/stubs/zos-storage.mjs')
const fs = await import('./helpers/stubs/zos-fs.mjs')
const sync = await import('../utils/sync.js')

await import('../app.js')

function seed() {
  storage.__resetStorage()
  fs.__resetFs()
  new storage.LocalStorage('aibolit-data.json')
  sync.initSync(null)
  delete globalThis.getApp
}

beforeEach(() => {
  seed()
})

test('onCall CONFIG_SYNCED запрашивает свежий конфиг с телефона вместо применения payload', async () => {
  const sent = []
  sync.initSync({
    request(payload) {
      sent.push(payload)
      if (payload.method === 'get_config') return Promise.resolve({ config: { revision: 9, medications: [], intakes: [] } })
      if (payload.method === 'get_take_logs') return Promise.resolve({ records: [] })
      return Promise.resolve({ success: true, count: 0 })
    },
  })

  appOpts.onCall({ method: 'config_synced', params: { config: { revision: 99, medications: [] } } })
  await new Promise((resolve) => setTimeout(resolve, 10))

  assert.ok(sent.some(p => p.method === 'get_config'), 'уведомление запускает запрос конфига')
  const store = storage.__stores().get('aibolit-data.json')
  assert.equal(store.get('configRevision'), 9, 'применён конфиг из ответа, а не из payload')
})

test('onCall CONFIG_SYNCED пишет в отладочный лог при включённой отладке', async () => {
  const store = storage.__stores().get('aibolit-data.json')
  store.set('settings', { debugMode: true })
  sync.initSync({ request: () => Promise.resolve({ config: { revision: 9 } }) })

  appOpts.onCall({ method: 'config_synced' })
  await new Promise((resolve) => setTimeout(resolve, 10))

  const log = store.get('debugLog')
  assert.ok(log.some(e => e.message.includes('получено уведомление об изменении настроек с телефона')))
})

test('onCall CLEAR_DEBUG очищает отладочный лог на часах', () => {
  const store = storage.__stores().get('aibolit-data.json')
  store.set('settings', { debugMode: true })
  store.set('debugLog', [{ ts: 1, message: 'старое' }])

  appOpts.onCall({ method: 'clear_debug' })

  assert.deepEqual(store.get('debugLog'), [])
})

test('onCreate запускает фоновую синхронизацию (get_config и get_take_logs)', async () => {
  const sent = []
  const fakeSide = {
    request(payload) {
      sent.push(payload)
      if (payload.method === 'get_config') return Promise.resolve({ config: { revision: 9, medications: [], intakes: [] } })
      if (payload.method === 'get_take_logs') return Promise.resolve({ records: [] })
      return Promise.resolve({ success: true, count: 0 })
    },
  }

  appOpts.onCreate.call({ globalData: { messaging: fakeSide } })
  await new Promise((resolve) => setTimeout(resolve, 20))

  assert.ok(sent.some(p => p.method === 'get_config'), 'onCreate запрашивает конфиг')
  assert.ok(sent.some(p => p.method === 'get_take_logs'), 'onCreate запрашивает take-логи')
})
