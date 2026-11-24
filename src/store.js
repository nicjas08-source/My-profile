// Key/value storage. Values are JSON. Cloudflare KV in production,
// memory (tests) or a JSON file (local dev, see server/dev.js) otherwise.

export class MemoryStore {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
  }
  async get(key) {
    const v = this.map.get(key);
    return v === undefined ? null : structuredClone(v);
  }
  async put(key, value) {
    this.map.set(key, structuredClone(value));
  }
  async delete(key) {
    this.map.delete(key);
  }
}

export class KVStore {
  constructor(kv) {
    this.kv = kv;
  }
  async get(key) {
    return this.kv.get(key, 'json');
  }
  async put(key, value) {
    await this.kv.put(key, JSON.stringify(value));
  }
  async delete(key) {
    await this.kv.delete(key);
  }
}
