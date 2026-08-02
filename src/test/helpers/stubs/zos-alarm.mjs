const calls = []

export function set(option) {
  calls.push({ method: 'set', option })
  return calls.length
}

export function cancel(id) {
  calls.push({ method: 'cancel', id })
}

export function getAllAlarms() {
  return []
}

export const REPEAT_WEEK = 4
export const REPEAT_ONCE = 0

export function __getCalls() {
  return calls
}

export function __reset() {
  calls.length = 0
}
