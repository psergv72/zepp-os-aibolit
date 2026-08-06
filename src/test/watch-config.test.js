import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const storage = await import('./helpers/stubs/zos-storage.mjs')
const { applyConfigToStorage, applyConfigFromSettings } = await import('../utils/watch-config.js')

function seed() {
  storage.__resetStorage()
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
