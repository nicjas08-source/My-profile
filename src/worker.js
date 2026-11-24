// Cloudflare Workers entry. Needs a KV namespace bound as PROFILES (see wrangler.toml).
import { handle } from './app.js';
import { KVStore } from './store.js';

export default {
  async fetch(request, env) {
    return handle(request, { store: new KVStore(env.PROFILES), BASE_URL: env.BASE_URL });
  },
};
