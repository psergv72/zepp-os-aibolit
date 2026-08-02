export const widget = {
  TEXT: 1,
  GROUP: 2,
  BUTTON: 3,
}

export const align = {
  CENTER_H: 1,
  CENTER_V: 2,
  LEFT: 3,
}

export const text_style = {
  NONE: 1,
  STRIKETHROUGH: 2,
}

export const event = {
  CLICK_UP: 1,
  CLICK_DOWN: 2,
}

export const prop = {}

const registry = []

export function createWidget(type, props) {
  const w = {
    type,
    props,
    deleted: false,
    listeners: {},
    setProperty() {},
    getProperty() { return {} },
    addEventListener(name, fn) {
      this.listeners[name] = fn
    },
  }
  registry.push(w)
  return w
}

export function deleteWidget(w) {
  w.deleted = true
}

export function getSysFontSize(size) {
  return size
}

export function __getRegistry() {
  return registry
}

export function __reset() {
  registry.length = 0
}
