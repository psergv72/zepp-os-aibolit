import { getTextLayout } from '@zos/ui'

export function textWidth(text, size) {
  const str = String(text == null ? '' : text)
  try {
    const layout = getTextLayout(str, { text_size: size, text_width: 0, wrapped: 0 })
    if (layout && layout.width) return layout.width
  } catch (e) {
    // fall through to heuristic below
  }
  return str.length * size * 0.6
}

export function wrapText(text, size, maxWidth) {
  const str = String(text == null ? '' : text)
  const words = str.split(/\s+/).filter(Boolean)
  if (words.length === 0) return str === '' ? [] : [str]
  if (maxWidth <= 0) return words

  const lines = []
  let current = ''

  for (const word of words) {
    const candidate = current ? current + ' ' + word : word
    if (textWidth(candidate, size) <= maxWidth) {
      current = candidate
      continue
    }

    if (current) lines.push(current)

    if (textWidth(word, size) > maxWidth) {
      let buf = ''
      for (const ch of word) {
        const next = buf + ch
        if (buf && textWidth(next, size) > maxWidth) {
          lines.push(buf)
          buf = ch
        } else {
          buf = next
        }
      }
      current = buf
    } else {
      current = word
    }
  }

  if (current) lines.push(current)
  return lines
}
