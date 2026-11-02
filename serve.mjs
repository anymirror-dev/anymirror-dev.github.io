// A static server for dist/ that resolves paths as GitHub Pages does:
// /maps serves maps.html, a directory its index.html, anything else 404.html;
// a single byte range gets 206, as the readers require.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
};
const dir = process.argv[2] ?? 'dist';
const port = Number(process.env.PORT ?? 8080);

async function isFile(path) {
  return (await stat(path).catch(() => null))?.isFile() ?? false;
}

async function resolve(urlPath) {
  const base = join(dir, normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, ''));
  for (const candidate of [base, `${base}.html`, join(base, 'index.html')]) {
    if (await isFile(candidate)) return candidate;
  }
  return null;
}

createServer(async (req, res) => {
  const path = await resolve(new URL(req.url, 'http://localhost').pathname);
  const file = path ?? join(dir, '404.html');
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const bytes = await readFile(file);
  const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range ?? '');
  if (path === null || range === null) {
    res.writeHead(path ? 200 : 404, { 'content-type': type, 'accept-ranges': 'bytes' });
    res.end(bytes);
    return;
  }
  const start = Number(range[1]);
  const end = Math.min(range[2] === '' ? bytes.length - 1 : Number(range[2]), bytes.length - 1);
  if (start > end) {
    res.writeHead(416, { 'content-range': `bytes */${bytes.length}` });
    res.end();
    return;
  }
  res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${bytes.length}` });
  res.end(bytes.subarray(start, end + 1));
}).listen(port, () => console.log(`http://localhost:${port}/`));
