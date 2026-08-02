import { getSysFontSize } from '@zos/ui'

const SYS_MIN_FONT = 16

let scaleCache = null
let minCache = null

export function getSysFontScale() {
  if (scaleCache === null) {
    scaleCache = getSysFontSize(SYS_MIN_FONT) / SYS_MIN_FONT
  }
  return scaleCache
}

export function getMinSystemFontSize() {
  if (minCache === null) {
    minCache = getSysFontSize(SYS_MIN_FONT)
  }
  return minCache
}

export function sysText(size) {
  return Math.max(size * getSysFontScale(), getMinSystemFontSize())
}
