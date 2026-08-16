import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

let appOpts = null
globalThis.App = (opts) => { appOpts = opts }
let sideOpts = null
globalThis.AppSideService = (opts) => { sideOpts = opts }

const storage = await import('./helpers/stubs/zos-storage.mjs')
const fs = await import('./helpers/stubs/zos-fs.mjs')
const syncModule = await import('../utils/sync.js')
const debugLogModule = await import('../utils/debug-log.js')

await import('../app.js')
await import('../app-side/index.js')

function seed() {
  storage.__resetStorage()
  fs.__resetFs()
  new storage.LocalStorage('aibolit-data.json')
  syncModule.initSync(null)
  const phoneStore = new Map()
  globalThis.settings = {
    settingsStorage: {
      getItem(key) {
        return phoneStore.has(key) ? phoneStore.get(key) : null
      },
      setItem(key, value) {
        phoneStore.set(key, value)
      },
    },
  }
  sideOpts.settings = {
    getItem: (key) => globalThis.settings.settingsStorage.getItem(key),
    setItem: (key, value) => globalThis.settings.settingsStorage.setItem(key, value),
  }
  sideOpts.call = (payload) => {
    appOpts.onCall(payload)
  }
  const watchStore = storage.__stores().get('aibolit-data.json')
  watchStore.set('settings', { debugMode: true })
}

beforeEach(() => {
  seed()
})

test('нажатие Обновить в Отладке обновляет debugInfo на телефоне', async () => {
  const sent = []
  syncModule.initSync({
    request(payload) {
      sent.push(payload)
      if (payload.method === 'debug_sync') {
        sideOpts.onRequest(payload, () => {})
      }
      return Promise.resolve({ success: true })
    },
  })

  sideOpts.onSettingsChange({ key: 'debugRefresh' })
  await new Promise((resolve) => setTimeout(resolve, 0))

  const debugInfoRaw = globalThis.settings.settingsStorage.getItem('debugInfo')
  assert.ok(debugInfoRaw, 'debugInfo должен быть записан на телефоне')
  const debugInfo = JSON.parse(debugInfoRaw)
  assert.ok(Array.isArray(debugInfo.log), 'debugInfo содержит лог')
})

test('pushDebugSnapshot отправляет свежий лог в снимке', async () => {
  const watchStore = storage.__stores().get('aibolit-data.json')
  debugLogModule.addDebugEntry('новое сообщение после отладки')

  const snapshots = []
  syncModule.initSync({
    request(payload) {
      if (payload.method === 'debug_sync') {
        snapshots.push(payload.params.snapshot)
        sideOpts.onRequest(payload, () => {})
      }
      return Promise.resolve({ success: true })
    },
  })

  pushDebugSnapshotIfPresent()
  await new Promise((resolve) => setTimeout(resolve, 0))

  assert.equal(snapshots.length, 1, 'снимок отправлен')
  assert.ok(snapshots[0].log.some(e => e.message === 'новое сообщение после отладки'), 'снимок содержит свежий лог')
})

function pushDebugSnapshotIfPresent() {
  // используем метод из debug-log, чтобы не дублировать импорт
  debugLogModule.pushDebugSnapshot()
}
