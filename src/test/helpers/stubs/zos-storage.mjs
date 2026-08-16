import { getItem, setItem, removeItem, clear } from '../../../utils/storage.js'
import { __resetFs } from './zos-fs.mjs'

const stores = new Map()

class LocalStorageLike {
  constructor(name) {
    this.name = name
    if (!stores.has(name)) {
      stores.set(name, this)
    }
  }

  getItem(key) {
    return getItem(key, undefined)
  }

  setItem(key, value) {
    setItem(key, value)
  }

  removeItem(key) {
    removeItem(key)
  }

  clear() {
    clear()
  }

  set(key, value) {
    this.setItem(key, value)
  }

  get(key) {
    return this.getItem(key)
  }

  has(key) {
    return this.getItem(key) !== undefined
  }
}

export class ShareLocalStorage extends LocalStorageLike {}

export class LocalStorage extends LocalStorageLike {}

export function __resetStorage() {
  clear()
  __resetFs()
}

export function __stores() {
  return stores
}
