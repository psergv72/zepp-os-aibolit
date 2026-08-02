export function createViewManager(createWidget, deleteWidget) {
  const widgets = []
  return {
    create(type, props) {
      const w = createWidget(type, props)
      widgets.push(w)
      return w
    },
    clear() {
      for (const w of widgets) deleteWidget(w)
      widgets.length = 0
    },
  }
}
