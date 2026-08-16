import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseNdJson } from '../utils/ndjson.js'

test('parseNdJson разбирает простую meta-строку без массивов', () => {
  const raw = '{"T":"meta","syncAlarmId":42}\n'
  assert.deepEqual(parseNdJson(raw), { syncAlarmId: 42 })
})

test('parseNdJson разбирает объект с массивом (построчные записи)', () => {
  const raw = '{"T":"meta","A":["medications"],"medications":2}\n{"T":"medications","D":{"id":"m1"}}\n{"T":"medications","D":{"id":"m2"}}\n'
  assert.deepEqual(parseNdJson(raw), { medications: [{ id: 'm1' }, { id: 'm2' }] })
})

test('parseNdJson разбирает обычный JSON (fallback после SaveAndQuit)', () => {
  const raw = '{"medications":[{"id":"m1"}]}'
  assert.deepEqual(parseNdJson(raw), { medications: [{ id: 'm1' }] })
})

test('parseNdJson разбирает многострочный обычный JSON (fallback)', () => {
  const raw = '{\n  "medications": [\n    { "id": "m1" }\n  ]\n}\n'
  assert.deepEqual(parseNdJson(raw), { medications: [{ id: 'm1' }] })
})

test('parseNdJson возвращает undefined для пустой строки', () => {
  assert.equal(parseNdJson(''), undefined)
  assert.equal(parseNdJson(undefined), undefined)
  assert.equal(parseNdJson(null), undefined)
})

test('parseNdJson возвращает undefined для битого содержимого', () => {
  assert.equal(parseNdJson('not json'), undefined)
})

test('parseNdJson сохраняет вложенные объекты и скаляры в meta', () => {
  const raw = '{"T":"meta","settings":{"debugMode":true,"minFontSize":16},"configRevision":3}\n'
  assert.deepEqual(parseNdJson(raw), { settings: { debugMode: true, minFontSize: 16 }, configRevision: 3 })
})
