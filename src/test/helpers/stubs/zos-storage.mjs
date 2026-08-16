const stores = new Map()

class LocalStorageLike {
  constructor(name) {
    this.name = name
    if (!stores.has(name)) {
      stores.set(name, new Map())
    }
  }

  getItem(key) {
    return stores.get(this.name).get(key)
  }

  setItem(key, value) {
    stores.get(this.name).set(key, value)
  }

  removeItem(key) {
    stores.get(this.name).delete(key)
  }

  clear() {
    stores.get(this.name).clear()
  }
}

export class ShareLocalStorage extends LocalStorageLike {}

export class LocalStorage extends LocalStorageLike {}

export function __resetStorage() {
  stores.clear()
}

export function __stores() {
  return stores
}
