/** storageDomain 的内存测试替身：读同步，写持久化语义用 Promise 表达。 */
class MemoryTable {
  constructor() {
    this.records = new Map()
  }

  get(key) {
    const value = this.records.get(String(key))
    return value === undefined ? undefined : structuredClone(value)
  }

  keys() {
    return [...this.records.keys()]
  }

  async put(key, value) {
    this.records.set(String(key), structuredClone(value))
  }

  async delete(key) {
    return this.records.delete(String(key))
  }

  async update(key, update) {
    const previous = this.get(key)
    if (previous === undefined) throw new Error('missing-key')
    const next = await update(previous)
    await this.put(key, next)
    return next
  }
}

class MemoryDomain {
  constructor() {
    this.tables = new Map()
  }

  table(name) {
    if (!this.tables.has(name)) this.tables.set(name, new MemoryTable())
    return this.tables.get(name)
  }

  async close() {}
}

export function memoryStores() {
  return {
    themes: new MemoryDomain(),
    writing: new MemoryDomain(),
    snippets: new MemoryDomain(),
    async close() {},
  }
}
