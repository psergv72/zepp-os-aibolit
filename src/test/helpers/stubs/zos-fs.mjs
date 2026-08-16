const files = {}
let nextFd = 1
const fds = new Map()

export const O_RDONLY = 0
export const O_WRONLY = 1
export const O_RDWR = 2
export const O_CREAT = 512
export const O_TRUNC = 1024

function resolvePath(option) {
  if (option && typeof option === 'object') return option.path
  return option
}

function strToBuffer(str) {
  const buf = new ArrayBuffer(str.length * 2)
  const view = new Uint16Array(buf)
  for (let i = 0; i < str.length; i++) view[i] = str.charCodeAt(i)
  return buf
}

function bufferToStr(buffer) {
  const view = new Uint16Array(buffer)
  let s = ''
  for (let i = 0; i < view.length; i++) s += String.fromCharCode(view[i])
  return s
}

export function openSync(option) {
  const path = resolvePath(option)
  const fd = nextFd++
  fds.set(fd, path)
  if (files[path] === undefined) files[path] = ''
  return fd
}

export function closeSync(option) {
  fds.delete(option.fd)
}

export function writeSync(option) {
  const path = fds.get(option.fd)
  if (path === undefined) return -1
  files[path] = bufferToStr(option.buffer)
  return option.buffer.byteLength
}

export function readSync(option) {
  const path = fds.get(option.fd)
  if (path === undefined) return 0
  const data = files[path] === undefined ? '' : files[path]
  const view = new Uint16Array(option.buffer)
  let n = 0
  for (let i = 0; i < view.length && i < data.length; i++) {
    view[i] = data.charCodeAt(i)
    n++
  }
  return n
}

export function statSync(option) {
  const path = resolvePath(option)
  if (files[path] === undefined) return undefined
  return { size: String(files[path]).length * 2 }
}

export function rmSync(option) {
  const path = resolvePath(option)
  delete files[path]
}

export function mkdirSync(option) {
  const path = resolvePath(option)
  if (files[path] === undefined) files[path] = ''
  return 0
}

export function readdirSync(option) {
  const path = resolvePath(option)
  const prefix = path.endsWith('/') ? path : path + '/'
  return Object.keys(files)
    .filter(k => k.startsWith(prefix))
    .map(k => k.slice(prefix.length))
}

export function openAssetsSync(option) {
  return openSync(option)
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

export function __fsFiles() {
  return files
}

export function __resetFs() {
  for (const k of Object.keys(files)) delete files[k]
}
