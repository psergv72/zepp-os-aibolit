import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const { AsyncStorage, Storage, EasyStorage } = await import('@silver-zepp/easy-storage')

test('easy-storage импортируется и экспортирует классы', () => {
  assert.equal(typeof AsyncStorage.WriteJson, 'function')
  assert.equal(typeof Storage.ReadFile, 'function')
  assert.equal(typeof EasyStorage, 'function')
})
