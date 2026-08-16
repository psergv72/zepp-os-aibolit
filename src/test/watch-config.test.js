import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const storage = await import('./helpers/stubs/zos-storage.mjs')
const fs = await import('./helpers/stubs/zos-fs.mjs')
const { applyConfigToStorage, applyConfigFromSettings, fetchConfigFromSide } = await import('../utils/watch-config.js')

function store() {
  return storage.__stores().get('aibolit-data.json')
}

function seed() {
  storage.__resetStorage()
  fs.__resetFs()
  new storage.ShareLocalStorage('aibolit-data.json')
}

beforeEach(() => {
  seed()
})

test('applyConfigToStorage применяет конфиг с более новой ревизией и сохраняет ревизию', () => {
  const result = applyConfigToStorage({
    revision: 5,
    medications: [{ id: 'm1' }],
    intakes: [{ id: 'i1' }],
    settings: { minFontSize: 20 },
  })

  assert.equal(result, true)
  const store = storage.__stores().get('aibolit-data.json')
  assert.deepEqual(store.get('medications'), [{ id: 'm1' }])
  assert.deepEqual(store.get('intakes'), [{ id: 'i1' }])
  assert.deepEqual(store.get('settings'), { minFontSize: 20 })
  assert.equal(store.get('configRevision'), 5)
})

test('applyConfigToStorage игнорирует конфиг со старой или равной ревизией', () => {
  applyConfigToStorage({ revision: 5, medications: [{ id: 'm1' }] })

  const result = applyConfigToStorage({ revision: 4, medications: [{ id: 'm2' }] })
  const resultEqual = applyConfigToStorage({ revision: 5, medications: [{ id: 'm3' }] })

  assert.equal(result, false)
  assert.equal(resultEqual, false)
  const store = storage.__stores().get('aibolit-data.json')
  assert.deepEqual(store.get('medications'), [{ id: 'm1' }])
})

test('applyConfigToStorage игнорирует конфиг без числовой ревизии', () => {
  assert.equal(applyConfigToStorage({ medications: [{ id: 'm1' }] }), false)
  assert.equal(applyConfigToStorage(null), false)
})

test('applyConfigFromSettings применяет настройки с более новой ревизией из settings.settingsStorage', () => {
  globalThis.settings = {
    settingsStorage: {
      getItem(key) {
        const map = {
          configRevision: '3',
          medications: JSON.stringify([{ id: 'm1' }]),
          intakes: JSON.stringify([{ id: 'i1' }]),
          settings: JSON.stringify({ minFontSize: 22 }),
        }
        return map[key] !== undefined ? map[key] : null
      },
    },
  }

  const result = applyConfigFromSettings()

  delete globalThis.settings
  assert.equal(result, true)
  const store = storage.__stores().get('aibolit-data.json')
  assert.deepEqual(store.get('medications'), [{ id: 'm1' }])
  assert.equal(store.get('configRevision'), 3)
})

test('applyConfigFromSettings применяет только настройки и продвигает ревизию', () => {
  globalThis.settings = {
    settingsStorage: {
      getItem(key) {
        const map = {
          configRevision: '6',
          settings: JSON.stringify({ minFontSize: 24 }),
        }
        return map[key] !== undefined ? map[key] : null
      },
    },
  }

  const result = applyConfigFromSettings()

  delete globalThis.settings
  assert.equal(result, true)
  const store = storage.__stores().get('aibolit-data.json')
  assert.deepEqual(store.get('settings'), { minFontSize: 24 })
  assert.equal(store.get('configRevision'), 6)
})

test('applyConfigFromSettings игнорирует настройки, если ревизия не новее', () => {
  applyConfigToStorage({ revision: 5, medications: [{ id: 'm1' }] })

  globalThis.settings = {
    settingsStorage: {
      getItem(key) {
        const map = {
          configRevision: '4',
          medications: JSON.stringify([{ id: 'm9' }]),
        }
        return map[key] !== undefined ? map[key] : null
      },
    },
  }

  const result = applyConfigFromSettings()

  delete globalThis.settings
  assert.equal(result, false)
  const store = storage.__stores().get('aibolit-data.json')
  assert.deepEqual(store.get('medications'), [{ id: 'm1' }])
})

test('applyConfigToStorage пишет в лог применение и пропуск ревизии при включённой отладке', () => {
  store().set('settings', { debugMode: true })

  assert.equal(applyConfigToStorage({ revision: 5, medications: [{ id: 'm1' }] }), true)
  applyConfigToStorage({ revision: 4, medications: [{ id: 'm2' }] })

  const log = store().get('debugLog')
  assert.ok(log.some(e => e.message.includes('настройки с телефона применены (ревизия 5)')))
  assert.ok(log.some(e => e.message.includes('пропущены: ревизия 4 не новее текущей')))
})

test('applyConfigToStorage не пишет в лог, когда отладка выключена', () => {
  assert.equal(applyConfigToStorage({ revision: 5, medications: [{ id: 'm1' }] }), true)
  assert.deepEqual(store().get('debugLog') || [], [])
})

test('applyConfigFromSettings пишет в лог применение и пропуск ревизии при включённой отладке', () => {
  store().set('settings', { debugMode: true })
  globalThis.settings = {
    settingsStorage: {
      getItem(key) {
        const map = { configRevision: '3', medications: JSON.stringify([{ id: 'm1' }]) }
        return map[key] !== undefined ? map[key] : null
      },
    },
  }

  const result = applyConfigFromSettings()

  assert.equal(result, true)
  const log = store().get('debugLog')
  assert.ok(log.some(e => e.message.includes('настройки из settingsStorage применены (ревизия 3)')))

  applyConfigFromSettings()
  assert.ok(store().get('debugLog').some(e => e.message.includes('настройки из settingsStorage пропущены')))

  delete globalThis.settings
})

test('fetchConfigFromSide пишет в лог неудачную попытку получения настроек', async () => {
  store().set('settings', { debugMode: true })
  globalThis.getApp = () => ({
    _options: {
      globalData: {
        messaging: {
          request() {
            return Promise.reject(new Error('offline'))
          },
        },
      },
    },
  })

  const result = await fetchConfigFromSide(undefined, 1, 1)

  delete globalThis.getApp
  assert.equal(result, false)
  const log = store().get('debugLog')
  assert.ok(log.some(e => e.message.includes('не удалось получить настройки с телефона')))
})

test('fetchConfigFromSide с источником пишет источник в сообщение запроса', async () => {
  store().set('settings', { debugMode: true })
  globalThis.getApp = () => ({
    _options: {
      globalData: {
        messaging: {
          request() {
            return Promise.resolve({ config: { revision: 9, medications: [{ id: 'm9' }] } })
          },
        },
      },
    },
  })

  const result = await fetchConfigFromSide('sync-тик', 1, 1)

  delete globalThis.getApp
  assert.equal(result, true)
  const log = store().get('debugLog')
  assert.ok(log.some(e => e.message.includes('запрос настроек с телефона (sync-тик, попытка 1)')))
})

test('fetchConfigFromSide пишет в лог запрос настроек при обращении к телефону', async () => {
  store().set('settings', { debugMode: true })
  const requests = []
  globalThis.getApp = () => ({
    _options: {
      globalData: {
        messaging: {
          request(payload) {
            requests.push(payload)
            return Promise.resolve({ config: { revision: 9, medications: [{ id: 'm9' }] } })
          },
        },
      },
    },
  })

  const result = await fetchConfigFromSide(undefined, 1, 1)

  delete globalThis.getApp
  assert.equal(result, true)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].method, 'get_config')
  const log = store().get('debugLog')
  assert.ok(log.some(e => e.message.includes('запрос настроек с телефона')))
})

test('fetchConfigFromSide не падает без setTimeout и без messaging (контекст app-service)', async () => {
  delete globalThis.settings
  delete globalThis.getApp
  const originalSetTimeout = globalThis.setTimeout
  delete globalThis.setTimeout
  try {
    const result = await fetchConfigFromSide(undefined, 2, 1)
    assert.equal(result, false)
  } finally {
    globalThis.setTimeout = originalSetTimeout
  }
})

test('fetchConfigFromSide не падает без setTimeout, когда запрос уже провалился', async () => {
  delete globalThis.settings
  globalThis.getApp = () => ({
    _options: {
      globalData: {
        messaging: {
          request() {
            return Promise.reject(new Error('offline'))
          },
        },
      },
    },
  })
  const originalSetTimeout = globalThis.setTimeout
  delete globalThis.setTimeout
  try {
    const result = await fetchConfigFromSide(undefined, 2, 1)
    assert.equal(result, false)
  } finally {
    globalThis.setTimeout = originalSetTimeout
    delete globalThis.getApp
  }
})
