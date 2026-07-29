export const STORAGE_KEYS = {
  MEDICATIONS: 'medications',
  SCHEDULE: 'schedule',
  INTAKES: 'intakes',
  CANCELLATIONS: 'cancellations',
  SETTINGS: 'settings',
  SYNC_QUEUE: 'syncQueue',
}

export const INTAKE_STATUS = {
  TAKEN: 'taken',
  SNOOZED: 'snoozed',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
}

export const DEFAULT_SETTINGS = {
  retryInterval: 60,
  syncInterval: 60,
  snoozeOptions: [30, 45, 60, 90],
}

export const WEEK_DAYS = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  SUN: 7,
}

export const DAY_NAMES_RU = {
  1: 'Пн',
  2: 'Вт',
  3: 'Ср',
  4: 'Чт',
  5: 'Пт',
  6: 'Сб',
  7: 'Вс',
}

export const ZML_METHODS = {
  SYNC_SCHEDULE: 'sync_schedule',
  SYNC_INTAKE: 'sync_intake',
  SYNC_CANCELLATION: 'sync_cancellation',
  UNDO_INTAKE: 'undo_intake',
  RESTORE_SLOT: 'restore_slot',
}

export const ALARM_MODES = {
  REMINDER: 'reminder',
  RETRY: 'retry',
  SNOOZE: 'snooze',
}
