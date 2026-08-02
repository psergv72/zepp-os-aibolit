import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const device = await import('./helpers/stubs/zos-device.mjs')
const { __reset } = await import('./helpers/stubs/zos-ui.mjs')

let screenLayout

beforeEach(() => {
  __reset()
  device.__setShape('round')
})

test('isRoundScreen: круглая форма -> true', async () => {
  device.__setShape('round')
  screenLayout = await import('../utils/screen-layout.js')
  assert.equal(screenLayout.isRoundScreen(), true)
})

test('isRoundScreen: прямоугольная форма -> false', async () => {
  device.__setShape('square')
  screenLayout = await import('../utils/screen-layout.js')
  assert.equal(screenLayout.isRoundScreen(), false)
})

test('getContentBounds: круглая — вписанный квадрат', async () => {
  device.__setShape('round')
  screenLayout = await import('../utils/screen-layout.js')
  assert.deepEqual(screenLayout.getContentBounds(), {
    left: 70, top: 70, right: 410, bottom: 410, width: 340, height: 340,
  })
})

test('getContentBounds: прямоугольная — вся ширина с полями', async () => {
  device.__setShape('square')
  screenLayout = await import('../utils/screen-layout.js')
  assert.deepEqual(screenLayout.getContentBounds(), {
    left: 20, top: 20, right: 460, bottom: 460, width: 440, height: 440,
  })
})
