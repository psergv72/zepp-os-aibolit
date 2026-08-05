import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'

register(new URL('./helpers/zos-loader.mjs', import.meta.url))

const { __reset } = await import('./helpers/stubs/zos-ui.mjs')

const { wrapText, textWidth } = await import('../utils/text-wrap.js')

beforeEach(() => {
  __reset()
})

test('textWidth измеряет ширину через getTextLayout', () => {
  assert.equal(textWidth('abc', 10), 18, 'ширина 3 символов по 6px (10sp * 0.6)')
  assert.equal(textWidth('', 10), 0, 'пустая строка имеет нулевую ширину')
})

test('короткий текст остаётся одной строкой', () => {
  assert.deepEqual(wrapText('Аспирин × 1', 10, 200), ['Аспирин × 1'])
})

test('длинный текст переносится по словам', () => {
  assert.deepEqual(wrapText('abc def ghi jkl', 10, 60), ['abc def', 'ghi jkl'])
})

test('несколько пробелов и переносов строк схлопываются', () => {
  assert.deepEqual(wrapText('a   b\nc d', 10, 20), ['a b', 'c d'])
})

test('слово шире строки делится по символам', () => {
  assert.deepEqual(wrapText('abcdefghij', 10, 30), ['abcde', 'fghij'])
})

test('пустой текст не даёт строк', () => {
  assert.deepEqual(wrapText('', 10, 60), [])
})

test('каждая строка не шире maxWidth', () => {
  const lines = wrapText('первое слово второе слово третье', 24, 160)
  assert.ok(lines.length > 1, 'текст должен перенестись')
  for (const line of lines) {
    assert.ok(textWidth(line, 24) <= 160, `строка «${line}» укладывается в maxWidth`)
  }
})
