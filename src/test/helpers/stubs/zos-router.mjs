const calls = []

export function push(opts) {
  calls.push({ method: 'push', opts })
}

export function replace(opts) {
  calls.push({ method: 'replace', opts })
}

export function back(opts) {
  calls.push({ method: 'back', opts })
}

export function __getCalls() {
  return calls
}

export function __reset() {
  calls.length = 0
}
