import { fileURLToPath } from 'node:url'
import { stat } from 'node:fs/promises'

const ZOS_STUBS = {
  '@zos/ui': './stubs/zos-ui.mjs',
  '@zos/router': './stubs/zos-router.mjs',
  '@zos/utils': './stubs/zos-utils.mjs',
  '@zos/storage': './stubs/zos-storage.mjs',
  '@zos/alarm': './stubs/zos-alarm.mjs',
  '@zos/device': './stubs/zos-device.mjs',
  '@zos/notification': './stubs/zos-notification.mjs',
}

export async function resolve(specifier, context, nextResolve) {
  if (ZOS_STUBS[specifier]) {
    return { url: new URL(ZOS_STUBS[specifier], import.meta.url).href, shortCircuit: true }
  }

  if (specifier.startsWith('.') && context.parentURL) {
    const base = new URL(specifier, context.parentURL)
    if (!base.pathname.endsWith('.js')) {
      const withJs = new URL(specifier + '.js', context.parentURL)
      try {
        await stat(fileURLToPath(withJs))
        return { url: withJs.href, shortCircuit: true }
      } catch (e) {
        // fall through
      }
      try {
        await stat(fileURLToPath(new URL(specifier + '/index.js', context.parentURL)))
        return { url: new URL(specifier + '/index.js', context.parentURL).href, shortCircuit: true }
      } catch (e2) {
        // fall through
      }
    }
  }

  return nextResolve(specifier, context)
}
