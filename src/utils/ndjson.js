const TOK = { T: 'type', A: '__arrays', D: 'data', M: 'meta' }

function decodeTokens(obj) {
  for (const k in obj) {
    const nk = TOK[k]
    if (nk && nk !== k) {
      obj[nk] = obj[k]
      delete obj[k]
    }
  }
  return obj
}

export function parseNdJson(content) {
  const raw = String(content || '').trim()
  if (!raw) return undefined

  const lines = raw.split('\n')
  if (!lines.length) return undefined

  let first
  try {
    first = decodeTokens(JSON.parse(lines[0]))
  } catch (e) {
    return undefined
  }
  if (!first || first.type !== 'meta') {
    try {
      return JSON.parse(raw)
    } catch (e) {
      return undefined
    }
  }

  const res = {}
  const arrays = {}
  for (let i = 0; i < lines.length; i++) {
    let obj
    try {
      obj = decodeTokens(JSON.parse(lines[i]))
    } catch (e) {
      continue
    }
    if (obj.type === 'meta') {
      const af = obj.__arrays || []
      const lookup = {}
      for (let j = 0; j < af.length; j++) lookup[af[j]] = 1
      for (const k in obj) {
        if (k === 'type' || k === '__arrays') continue
        const v = obj[k]
        if (lookup[k]) {
          arrays[k] = []
          res[k] = arrays[k]
        } else {
          res[k] = v
        }
      }
    } else {
      const akey = obj.type
      if (!arrays[akey]) {
        arrays[akey] = []
        res[akey] = arrays[akey]
      }
      arrays[akey].push(obj.data)
    }
  }
  return res
}
