import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createGameServer } from './index.mjs';

const dev = process.argv.includes('--dev');
const root = resolve(dev ? 'web' : 'dist');
if (!existsSync(resolve(root, 'index.html'))) {
  console.error('Missing web build. Run npm run build, or npm run dev for source files.');
  process.exit(1);
}
const port = Number(process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 0 || port > 65535) { console.error('PORT must be between 0 and 65535.'); process.exit(1); }
const host = process.env.HOST || '0.0.0.0';
const app = createGameServer({ root });
await app.listen(port, host);
console.log(`Basket Random ${dev ? 'development' : 'server'} listening on http://${host}:${app.server.address().port}`);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
