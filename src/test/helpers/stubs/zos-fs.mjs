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

export const O_RDONLY = 0
export const O_WRONLY = 1
export const O_RDWR = 2
export const O_APPEND = 8
export const O_CREAT = 512
export const O_TRUNC = 1024
export const O_EXCL = 2048

const fds = {}

export function openSync(option) {
  const path = resolvePath(option)
  if (files[path] === undefined) files[path] = ''
  const fd = (fds.__counter = (fds.__counter || 0) + 1)
  fds[fd] = path
  return fd
}

export function openAssetsSync(option) {
  return openSync(option)
}

export function closeSync(option) {
  const fd = option && typeof option === 'object' ? option.fd : option
  delete fds[fd]
}

export function writeSync(option) {
  const path = fds[option.fd]
  if (path === undefined) return -1
  const data = option.buffer
  files[path] = data instanceof ArrayBuffer ? new TextDecoder('utf-16le').decode(data) : data
  return files[path].length
}

export function readSync(option) {
  const path = fds[option.fd]
  const value = files[path]
  if (value === undefined || value === '') return 0
  const bytes = new TextEncoder().encode(value).slice(0, option.length || value.length)
  new Uint8Array(option.buffer).set(bytes)
  return bytes.length
}

export function mkdirSync(option) {
  const path = resolvePath(option)
  if (files[path] === undefined) files[path] = ''
}

export function readdirSync(option) {
  const path = resolvePath(option)
  const prefix = path.endsWith('/') ? path : path + '/'
  return Object.keys(files)
    .filter((p) => p.startsWith(prefix))
    .map((p) => p.slice(prefix.length).split('/')[0])
}

export function __fsFiles() {
  return files
}

export function __resetFs() {
  for (const k of Object.keys(files)) delete files[k]
}
