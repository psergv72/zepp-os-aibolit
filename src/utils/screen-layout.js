import { getDeviceInfo, SCREEN_SHAPE_ROUND } from '@zos/device'

const ROUND_MARGIN = 70
const SQUARE_MARGIN = 20

export function isRoundScreen() {
  return getDeviceInfo().screenShape === SCREEN_SHAPE_ROUND
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
