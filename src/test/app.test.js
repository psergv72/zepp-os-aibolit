import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let appOpts = null
globalThis.App = (opts) => { appOpts = opts }

const storage = await import('./helpers/stubs/zos-storage.mjs')

await import('../app.js')

const originalSyncConfig = appOpts.syncConfig

function seed() {
  storage.__resetStorage()
  new storage.ShareLocalStorage('aibolit-data.json')
  appOpts.syncConfig = originalSyncConfig
  delete appOpts.request
}

beforeEach(() => {
  seed()
})

test('onCall CONFIG_SYNCED запрашивает свежий конфиг с телефона вместо применения payload', () => {
  let syncCalled = 0
  appOpts.syncConfig = () => { syncCalled++ }

  appOpts.onCall({ method: 'config_synced', params: { config: { revision: 99, medications: [] } } })

  assert.equal(syncCalled, 1, 'уведомление запускает syncConfig')
  const store = storage.__stores().get('aibolit-data.json')
  assert.equal(store.get('configRevision'), undefined, 'payload не применяется напрямую')
})

test('onCall CONFIG_SYNCED пишет в отладочный лог при включённой отладке', () => {
  const store = storage.__stores().get('aibolit-data.json')
  store.set('settings', { debugMode: true })
  appOpts.syncConfig = () => {}

  appOpts.onCall({ method: 'config_synced' })

  const log = store.get('debugLog')
  assert.ok(log.some(e => e.message.includes('получено уведомление об изменении настроек с телефона')))
})

test('syncConfig применяет конфиг с телефона при успешном ответе', async () => {
  const requests = []
  appOpts.request = (payload) => {
    requests.push(payload)
    return Promise.resolve({
      config: {
        revision: 3,
        medications: [{ id: 'm1' }],
        intakes: [{ id: 'i1' }],
        settings: { minFontSize: 20 },
      },
    })
  }

  appOpts.syncConfig()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(requests.length, 1)
  assert.equal(requests[0].method, 'get_config')
  const store = storage.__stores().get('aibolit-data.json')
  assert.deepEqual(store.get('medications'), [{ id: 'm1' }])
  assert.deepEqual(store.get('intakes'), [{ id: 'i1' }])
  assert.deepEqual(store.get('settings'), { minFontSize: 20 })
  assert.equal(store.get('configRevision'), 3)
})

test('syncConfig игнорирует конфиг с не более новой ревизией', async () => {
  appOpts.request = () => Promise.resolve({ config: { revision: 3, medications: [{ id: 'm1' }] } })

  appOpts.syncConfig()
  await new Promise((resolve) => setTimeout(resolve, 0))

  appOpts.request = () => Promise.resolve({ config: { revision: 3, medications: [{ id: 'm2' }] } })

  appOpts.syncConfig()
  await new Promise((resolve) => setTimeout(resolve, 0))

  const store = storage.__stores().get('aibolit-data.json')
  assert.deepEqual(store.get('medications'), [{ id: 'm1' }])
})

test('onCall CLEAR_DEBUG очищает отладочный лог на часах', () => {
  const store = storage.__stores().get('aibolit-data.json')
  store.set('settings', { debugMode: true })
  store.set('debugLog', [{ ts: 1, message: 'старое' }])

  appOpts.onCall({ method: 'clear_debug' })

  assert.deepEqual(store.get('debugLog'), [])
})
