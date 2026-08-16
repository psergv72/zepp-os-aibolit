export const __calls = []
export const __cancelCalls = []
const activeIds = new Set()
let nextId = 1
let failNextNotify = false

export function notify(options) {
  if (failNextNotify) {
    failNextNotify = false
    throw new Error('notify failed')
  }
  __calls.push(options)
  const id = nextId++
  activeIds.add(id)
  return id
}

export function cancel(ids) {
  const list = Array.isArray(ids) ? ids : [ids]
  for (const id of list) activeIds.delete(id)
  __cancelCalls.push(list)
}

export function getAllNotifications() {
  return Array.from(activeIds)
}

export function __reset() {
  __calls.length = 0
  __cancelCalls.length = 0
  activeIds.clear()
  nextId = 1
  failNextNotify = false
}

export function __failNextNotify(value = true) {
  failNextNotify = value
}
