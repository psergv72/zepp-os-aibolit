export const widget = {
  TEXT: 1,
  GROUP: 2,
  BUTTON: 3,
  FILL_RECT: 4,
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

export function getTextLayout(text, options) {
  const size = options && options.text_size ? options.text_size : 16
  return { width: Math.ceil(text.length * size * 0.6), height: size, rows: 1, result: 0, text }
}

export function __getRegistry() {
  return registry
}

export function __reset() {
  registry.length = 0
}
