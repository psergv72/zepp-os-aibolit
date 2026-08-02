import { widget, align, text_style, getTextLayout } from '@zos/ui'
import { getDeviceInfo, SCREEN_SHAPE_ROUND } from '@zos/device'
import { sysText, getUiScale } from './ui-scale'

const ROUND_MARGIN = 70
const SQUARE_MARGIN = 20
const SCREEN_HEIGHT = 480

export function isRoundScreen() {
  return getDeviceInfo().screenShape === SCREEN_SHAPE_ROUND
}

export function enableScroll(totalHeight) {
  if (typeof hmUI === 'undefined' || !hmUI.setScrollView) return false
  if (totalHeight > SCREEN_HEIGHT) {
    return hmUI.setScrollView(true, Math.ceil(totalHeight), 1, true)
  }
  return hmUI.setScrollView(false, SCREEN_HEIGHT, 1, true)
}

export function getContentBounds() {
  const m = isRoundScreen() ? ROUND_MARGIN : SQUARE_MARGIN
  return {
    left: m,
    top: m,
    right: 480 - m,
    bottom: 480 - m,
    width: 480 - m * 2,
    height: 480 - m * 2,
  }
}

export function renderTimeHeader(ui, { text, x, y, right, color = 0xffffff, sizeSp = 26, rowH = 44, lineColor = 0x2a2a2a, textStyle = text_style.NONE }) {
  const S = getUiScale()
  const size = sysText(sizeSp)
  const lineH = Math.max(2, 3 * S)

  let timeW = 0
  try {
    const layout = getTextLayout(text, { text_size: size, text_width: 0, wrapped: 0 })
    timeW = layout && layout.width ? layout.width : 0
  } catch (e) {
    timeW = 0
  }
  if (!timeW) timeW = text.length * size * 0.6

  const gap = 18 * S
  ui.create(widget.TEXT, {
    x: x,
    y: y,
    w: timeW + gap,
    h: rowH,
    color: color,
    text_size: size,
    align_h: align.LEFT,
    align_v: align.CENTER_V,
    text_style: textStyle,
    text: text,
  })

  const lineX = x + timeW + gap
  if (lineX < right - 4) {
    ui.create(widget.FILL_RECT, {
      x: lineX,
      y: y + rowH / 2 - lineH / 2,
      w: right - lineX,
      h: lineH,
      color: lineColor,
    })
  }
}

export function renderNavButton(ui, { x, y, w, h, text, color = 0xffffff, bgColor = 0x2a2a2a }) {
  ui.create(widget.FILL_RECT, {
    x: x,
    y: y,
    w: w,
    h: h,
    radius: h / 2,
    color: bgColor,
  })
  return ui.create(widget.TEXT, {
    x: x,
    y: y,
    w: w,
    h: h,
    color: color,
    text_size: sysText(26),
    align_h: align.CENTER_H,
    align_v: align.CENTER_V,
    text_style: text_style.NONE,
    text: text,
  })
}
