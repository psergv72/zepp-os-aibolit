let shape = 'round'

export const SCREEN_SHAPE_SQUARE = 1
export const SCREEN_SHAPE_ROUND = 2

export function getDeviceInfo() {
  return {
    width: 480,
    height: 480,
    screenShape: shape === 'round' ? SCREEN_SHAPE_ROUND : SCREEN_SHAPE_SQUARE,
  }
}

export function __setShape(next) {
  shape = next === 'square' ? 'square' : 'round'
}
