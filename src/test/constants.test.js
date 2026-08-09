import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_SETTINGS, ZML_METHODS } from '../utils/constants.js'

test('DEFAULT_SETTINGS.retryInterval равен 5', () => {
  assert.equal(DEFAULT_SETTINGS.retryInterval, 5)
})

test('ZML_METHODS.CLEAR_DEBUG равен clear_debug', () => {
  assert.equal(ZML_METHODS.CLEAR_DEBUG, 'clear_debug')
})
