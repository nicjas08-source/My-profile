// Local server on plain Node (no Cloudflare account needed).
// Data persists in .data/store.json. Usage: npm run dev [-- --port 8787]
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { handle } from '../src/app.js';
import { MemoryStore } from '../src/store.js';

const port = Number(process.env.PORT || process.argv[process.argv.indexOf('--port') + 1] || 8787);
const file = process.env.DATA_FILE || '.data/store.json';

class FileStore extends MemoryStore {
  constructor(path) {
    super(existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {});
    this.path = path;
  }
  async put(k, v) { await super.put(k, v); this.flush(); }
  async delete(k) { await super.delete(k); this.flush(); }
  flush() {
    mkdirSync(this.path.replace(/\/[^/]+$/, ''), { recursive: true });
    writeFileSync(this.path, JSON.stringify(Object.fromEntries(this.map)));
  }
}

const store = new FileStore(file);

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const request = new Request(`${proto}://${req.headers.host}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
  });
  const response = await handle(request, { store, BASE_URL: process.env.BASE_URL });
  const headers = {};
  response.headers.forEach((v, k) => (headers[k] = v));
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () => console.log(`Profiles running on http://localhost:${port}`));
