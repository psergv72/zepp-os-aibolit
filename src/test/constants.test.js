import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS } from '../utils/constants.js'

test('DEFAULT_SETTINGS.retryInterval равен 5', () => {
  assert.equal(DEFAULT_SETTINGS.retryInterval, 5)
})
