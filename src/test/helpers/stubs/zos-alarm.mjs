const calls = []
const activeIds = new Set()

export function set(option) {
  const id = calls.length + 1
  calls.push({ method: 'set', option, id })
  activeIds.add(id)
  return id
}

export function cancel(id) {
  const list = Array.isArray(id) ? id : [id]
  for (const x of list) activeIds.delete(x)
  calls.push({ method: 'cancel', id })
}

export function getAllAlarms() {
  return Array.from(activeIds)
}

export const REPEAT_WEEK = 4
export const REPEAT_ONCE = 0
export const REPEAT_MINUTE = 1

export function __getCalls() {
  return calls
}

export function __reset() {
  calls.length = 0
  activeIds.clear()
}
