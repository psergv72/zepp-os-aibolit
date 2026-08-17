let listeners = []

export function subscribeToData(fn) {
  if (typeof fn !== 'function') return () => {}
  listeners.push(fn)
  return () => {
    listeners = listeners.filter((l) => l !== fn)
  }
}

export function emitDataChanged() {
  const current = listeners.slice()
  for (let i = 0; i < current.length; i++) {
    try {
      current[i]()
    } catch (e) {
      console.error('aibolit data-events: слушатель данных бросил', e)
    }
  }
}
