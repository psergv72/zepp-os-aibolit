import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getWeekDayBit,
  getWeekDaysBitmask,
  isIntakeOnDay,
  getEnabledMedItems,
  getIntakeEntries,
  isIntakeTakenToday,
  isIntakeCancelledToday,
  isIntakeSkippedToday,
  getIntakeStatus,
  getTakenTime,
  buildItemsSummary,
  medItemText,
  timeToMinutes,
  sortIntakeEntriesByTime,
} from '../utils/intake-logic.js'

const MEDS = [
  { id: 'm1', name: 'Парацетамол', enabled: true },
  { id: 'm2', name: 'Аспирин', enabled: true },
  { id: 'm3', name: 'Отключён', enabled: false },
]

test('getWeekDayBit maps valid days', () => {
  assert.equal(getWeekDayBit(1), 2)
  assert.equal(getWeekDayBit(2), 4)
  assert.equal(getWeekDayBit(3), 8)
  assert.equal(getWeekDayBit(4), 16)
  assert.equal(getWeekDayBit(5), 32)
  assert.equal(getWeekDayBit(6), 64)
  assert.equal(getWeekDayBit(7), 128)
})

test('getWeekDayBit returns 0 for unknown day', () => {
  assert.equal(getWeekDayBit(0), 0)
  assert.equal(getWeekDayBit(8), 0)
})

test('getWeekDaysBitmask empty or null means every day', () => {
  assert.equal(getWeekDaysBitmask([]), 254)
  assert.equal(getWeekDaysBitmask(null), 254)
  assert.equal(getWeekDaysBitmask(undefined), 254)
})

test('getWeekDaysBitmask combines bits', () => {
  assert.equal(getWeekDaysBitmask([1]), 2)
  assert.equal(getWeekDaysBitmask([1, 3, 5]), 42)
  assert.equal(getWeekDaysBitmask([2, 7]), 132)
})

test('isIntakeOnDay: null weekDays = every day', () => {
  const intake = { weekDays: null }
  assert.equal(isIntakeOnDay(intake, 1), true)
  assert.equal(isIntakeOnDay(intake, 7), true)
})

test('isIntakeOnDay matches or not', () => {
  const intake = { weekDays: [1, 3, 5] }
  assert.equal(isIntakeOnDay(intake, 3), true)
  assert.equal(isIntakeOnDay(intake, 4), false)
})

test('getEnabledMedItems filters disabled and missing meds', () => {
  const intake = {
    items: [
      { medicationId: 'm1', amount: '2 таблетки' },
      { medicationId: 'm2', amount: '1 таблетка' },
      { medicationId: 'm3', amount: '3' },
      { medicationId: 'missing', amount: '1' },
    ],
  }
  assert.deepEqual(getEnabledMedItems(intake, MEDS), [
    { medicationId: 'm1', amount: '2 таблетки' },
    { medicationId: 'm2', amount: '1 таблетка' },
  ])
})

test('getIntakeEntries keeps enabled meds with med object, drops empty intakes', () => {
  const intakes = [
    { id: 'i1', time: '08:00', weekDays: null, items: [
      { medicationId: 'm1', amount: '2 таблетки' },
      { medicationId: 'm3', amount: '3' },
    ] },
    { id: 'i2', time: '12:00', weekDays: null, items: [
      { medicationId: 'm3', amount: '3' },
    ] },
    { id: 'i3', time: '20:00', weekDays: null, items: [] },
  ]
  const result = getIntakeEntries(intakes, MEDS)
  assert.equal(result.length, 1)
  assert.equal(result[0].intake.id, 'i1')
  assert.deepEqual(result[0].items, [
    { med: MEDS[0], amount: '2 таблетки' },
  ])
})

test('isIntakeTakenToday checks taken status by intakeId and date', () => {
  const logs = [
    { intakeId: 'i1', date: '2026-08-01', status: 'taken' },
    { intakeId: 'i1', date: '2026-08-01', status: 'snoozed' },
  ]
  assert.equal(isIntakeTakenToday('i1', '2026-08-01', logs), true)
  assert.equal(isIntakeTakenToday('i2', '2026-08-01', logs), false)
  assert.equal(isIntakeTakenToday('i1', '2026-08-02', logs), false)
})

test('isIntakeCancelledToday checks pair intakeId+date', () => {
  const cancellations = [{ intakeId: 'i1', date: '2026-08-01' }]
  assert.equal(isIntakeCancelledToday('i1', '2026-08-01', cancellations), true)
  assert.equal(isIntakeCancelledToday('i2', '2026-08-01', cancellations), false)
})

test('getIntakeStatus: taken wins over cancelled, else cancelled, else pending', () => {
  const logs = [{ intakeId: 'i1', date: 'd', status: 'taken' }]
  const cancellations = [{ intakeId: 'i1', date: 'd' }, { intakeId: 'i2', date: 'd' }]
  assert.equal(getIntakeStatus('i1', 'd', logs, cancellations), 'taken')
  assert.equal(getIntakeStatus('i2', 'd', logs, cancellations), 'cancelled')
  assert.equal(getIntakeStatus('i3', 'd', logs, cancellations), 'pending')
})

test('isIntakeSkippedToday проверяет пару intakeId+date по статусу skipped', () => {
  const logs = [
    { intakeId: 'i1', date: 'd', status: 'skipped' },
    { intakeId: 'i2', date: 'd', status: 'snoozed' },
  ]
  assert.equal(isIntakeSkippedToday('i1', 'd', logs), true)
  assert.equal(isIntakeSkippedToday('i2', 'd', logs), false)
  assert.equal(isIntakeSkippedToday('i1', 'd2', logs), false)
})

test('getIntakeStatus: приоритет taken > cancelled > skipped > pending', () => {
  const logs = [{ intakeId: 'i1', date: 'd', status: 'skipped' }]
  assert.equal(getIntakeStatus('i1', 'd', logs, []), 'skipped')

  const logsTaken = [
    { intakeId: 'i2', date: 'd', status: 'skipped' },
    { intakeId: 'i2', date: 'd', status: 'taken' },
  ]
  assert.equal(getIntakeStatus('i2', 'd', logsTaken, []), 'taken')

  const cancellations = [{ intakeId: 'i3', date: 'd' }]
  const logsCancelled = [{ intakeId: 'i3', date: 'd', status: 'skipped' }]
  assert.equal(getIntakeStatus('i3', 'd', logsCancelled, cancellations), 'cancelled')
})

test('getTakenTime returns takenTime of taken log or null', () => {
  const logs = [
    { intakeId: 'i1', date: 'd', status: 'taken', takenTime: '08:05' },
    { intakeId: 'i2', date: 'd', status: 'snoozed', takenTime: '08:07' },
  ]
  assert.equal(getTakenTime('i1', 'd', logs), '08:05')
  assert.equal(getTakenTime('i2', 'd', logs), null)
  assert.equal(getTakenTime('i3', 'd', logs), null)
})

test('buildItemsSummary joins name (dosage), amount, skips disabled and missing', () => {
  const items = [
    { medicationId: 'm1', amount: '2 таблетки' },
    { medicationId: 'm2', amount: '' },
    { medicationId: 'm3', amount: '3' },
    { medicationId: 'missing', amount: '1' },
  ]
  assert.equal(buildItemsSummary(items, MEDS), 'Парацетамол, 2 таблетки, Аспирин')
  assert.equal(buildItemsSummary([], MEDS), '')
})

test('medItemText formats name (dosage), amount', () => {
  assert.equal(
    medItemText({ med: { name: 'Аспирин', dosage: '100 мг' }, amount: '1' }),
    'Аспирин (100 мг), 1'
  )
  assert.equal(medItemText({ med: { name: 'Аспирин', dosage: '' }, amount: '2' }), 'Аспирин, 2')
  assert.equal(medItemText({ med: { name: 'Аспирин', dosage: '100 мг' }, amount: '' }), 'Аспирин (100 мг)')
})

test('timeToMinutes парсит HH:MM и H:MM в минуты', () => {
  assert.equal(timeToMinutes('08:00'), 480)
  assert.equal(timeToMinutes('8:00'), 480)
  assert.equal(timeToMinutes('23:59'), 1439)
  assert.equal(timeToMinutes('00:00'), 0)
  assert.equal(timeToMinutes(''), 0)
  assert.equal(timeToMinutes('abc'), 0)
  assert.equal(timeToMinutes(' 8:00 '), 480)
})

test('sortIntakeEntriesByTime сортирует по времени, устойчив к формату без нуля', () => {
  const mk = (time) => ({ intake: { time } })
  const result = sortIntakeEntriesByTime([mk('10:00'), mk('8:00'), mk('09:30')])
  assert.deepEqual(result.map(e => e.intake.time), ['8:00', '09:30', '10:00'])
})
