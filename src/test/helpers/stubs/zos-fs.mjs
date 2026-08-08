const files = {}

function resolvePath(option) {
  if (option && typeof option === 'object') return option.path
  return option
}

export function writeFileSync(option) {
  const path = resolvePath(option)
  const data = option && typeof option === 'object' ? option.data : option
  files[path] = data
}

export function readFileSync(option) {
  const path = resolvePath(option)
  const value = files[path]
  return value === undefined ? undefined : value
}

export function rmSync(option) {
  const path = resolvePath(option)
  delete files[path]
}

export function statSync(option) {
  const path = resolvePath(option)
  if (files[path] === undefined) return undefined
  return { size: String(files[path]).length }
}

export function __fsFiles() {
  return files
}

export function __resetFs() {
  for (const k of Object.keys(files)) delete files[k]
}
