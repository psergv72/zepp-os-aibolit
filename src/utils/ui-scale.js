import { getSysFontSize } from '@zos/ui'
import { getSettings } from './storage'

const SYS_MIN_FONT = 16

let scaleCache = null

export function getSysFontScale() {
  if (scaleCache === null) {
    scaleCache = getSysFontSize(SYS_MIN_FONT) / SYS_MIN_FONT
  }
  return scaleCache
}

export function getMinFontSize() {
  const settings = getSettings()
  const value = settings && settings.minFontSize
  const min = parseInt(value, 10)
  return Number.isFinite(min) && min >= SYS_MIN_FONT ? min : SYS_MIN_FONT
}

export function getMinSystemFontSize() {
  return getSysFontSize(SYS_MIN_FONT)
}

export function sysText(size) {
  const min = getMinFontSize()
  return getSysFontSize(Math.max(size * (min / SYS_MIN_FONT), min))
}

export function getUiScale() {
  return getSysFontScale() * (getMinFontSize() / SYS_MIN_FONT)
}

export function uiSize(size) {
  return size * getUiScale()
}
