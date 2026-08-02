export const __calls = []

export function notify(options) {
  __calls.push(options)
}

export function __reset() {
  __calls.length = 0
}
