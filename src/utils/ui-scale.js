import { getSysFontSize } from '@zos/ui'

let cached = null

export function getSysFontScale() {
  if (cached === null) {
    cached = getSysFontSize(100) / 100
  }
  return cached
}
