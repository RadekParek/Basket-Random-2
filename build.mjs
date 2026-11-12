import { build } from 'esbuild';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
const javascript = await build({ entryPoints: ['web/src/main.js'], bundle: true, minify: true, format: 'iife', target: 'es2020', legalComments: 'none', write: false });
const css = await build({ entryPoints: ['web/src/style.css'], minify: true, write: false });
await writeFile('dist/game.js', javascript.outputFiles[0].contents);
await writeFile('dist/style.css', css.outputFiles[0].contents);
const html = (await readFile('web/index.html', 'utf8')).replace('src/style.css', 'style.css').replace('<script type="module" src="src/main.js"></script>', '<script src="game.js" defer></script>');
await writeFile('dist/index.html', html);
let raw = 0, compressed = 0;
for (const file of ['index.html', 'game.js', 'style.css']) {
  const data = await readFile(`dist/${file}`), gzip = gzipSync(data, { level: 9 });
  await writeFile(`dist/${file}.gz`, gzip); raw += data.length; compressed += gzip.length;
  console.log(`${file.padEnd(12)} ${String(data.length).padStart(6)} B  ${String(gzip.length).padStart(6)} B gzip`);
}
console.log(`Total        ${String(raw).padStart(6)} B  ${String(compressed).padStart(6)} B gzip`);
if (raw > 160000) throw new Error(`Web payload exceeded 160 KB: ${raw} bytes`);
