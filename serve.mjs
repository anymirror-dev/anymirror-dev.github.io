// A static server for dist/ that resolves paths as GitHub Pages does:
// /maps serves maps.html, a directory its index.html, anything else 404.html.
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
  res.writeHead(path ? 200 : 404, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(await readFile(file));
}).listen(port, () => console.log(`http://localhost:${port}/`));
