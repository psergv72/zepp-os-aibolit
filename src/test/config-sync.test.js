import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONFIG_KEYS, parseSettingsItem } from '../utils/config-sync.js'

test('CONFIG_KEYS contains the three config keys', () => {
  assert.deepEqual(CONFIG_KEYS, ['medications', 'intakes', 'settings'])
})

test('parseSettingsItem parses JSON string to object', () => {
  assert.deepEqual(parseSettingsItem('[{"id":"m1"}]'), [{ id: 'm1' }])
  assert.deepEqual(parseSettingsItem('{"retryInterval":60}'), { retryInterval: 60 })
})

test('parseSettingsItem returns object as-is', () => {
  const obj = { retryInterval: 60 }
  assert.equal(parseSettingsItem(obj), obj)
})

test('parseSettingsItem returns null for null and undefined', () => {
  assert.equal(parseSettingsItem(null), null)
  assert.equal(parseSettingsItem(undefined), null)
})

test('parseSettingsItem returns null for invalid JSON string', () => {
  assert.equal(parseSettingsItem('not json'), null)
})
