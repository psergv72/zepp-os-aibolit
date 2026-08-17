const root = (typeof globalThis !== 'undefined')
  ? globalThis
  : (typeof global !== 'undefined' ? global : (typeof self !== 'undefined' ? self : {}))

function getListeners() {
  if (!root.__aibolitDataListeners) root.__aibolitDataListeners = []
  return root.__aibolitDataListeners
}

export function subscribeToData(fn) {
  if (typeof fn !== 'function') return () => {}
  getListeners().push(fn)
  return () => {
    const listeners = getListeners()
    const idx = listeners.indexOf(fn)
    if (idx >= 0) listeners.splice(idx, 1)
  }
}

export function emitDataChanged() {
  const current = getListeners().slice()
  for (let i = 0; i < current.length; i++) {
    try {
      current[i]()
    } catch (e) {
      console.error('aibolit data-events: слушатель данных бросил', e)
    }
  }
}
