const listeners = new Set()

export function subscribeToData(fn) {
  if (typeof fn !== 'function') return () => {}
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function emitDataChanged() {
  for (const fn of Array.from(listeners)) {
    try {
      fn()
    } catch (e) {
      // ошибка слушателя не должна прерывать остальных
    }
  }
}
