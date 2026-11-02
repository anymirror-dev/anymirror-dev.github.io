// Builds anymirror.dev into dist/: the pages in src/pages inside the shared
// layout, code samples and tables copied from the READMEs of the pinned
// packages (so the site shows exactly what the release documents), the
// self-hosted fonts, the brand assets in public/, and the map page's
// vendored libraries.
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, 'dist');
const modules = join(root, 'node_modules');
const SITE = 'https://anymirror.dev';
const REPO = 'https://github.com/anymirror-dev/anymirror';

const PAGES = {
  'index.html': {
    path: '/',
    title: 'anymirror — verified content over dumb hosts',
    description: 'Fetch files from any HTTP host and verify every byte against a CID before using it. Publishing is cp; mirroring is rsync.',
  },
  'maps.html': {
    path: '/maps',
    title: 'veritiles, anymirror for maps',
    description: 'Verified map tiles from any host: a PMTiles Source that checks every byte against a CID before your map renders it.',
  },
  'docs.html': {
    path: '/docs',
    title: 'Docs · anymirror',
    description: 'The anymirror packages, the packer and the specification.',
  },
  '404.html': {
    path: '/404',
    title: 'Not found · anymirror',
    description: 'This page does not exist.',
  },
};

const FONTS = [
  ['Inter Tight', 'inter-tight', [400, 500, 600]],
  ['JetBrains Mono', 'jetbrains-mono', [400, 500, 600]],
];
const PRELOAD = ['inter-tight-latin-400-normal.woff2', 'inter-tight-latin-600-normal.woff2', 'jetbrains-mono-latin-400-normal.woff2'];

const VENDOR = {
  'maplibre-gl.mjs': 'maplibre-gl/dist/maplibre-gl.mjs',
  'maplibre-gl-worker.mjs': 'maplibre-gl/dist/maplibre-gl-worker.mjs',
  'maplibre-gl.css': 'maplibre-gl/dist/maplibre-gl.css',
  'pmtiles.js': 'pmtiles/dist/pmtiles.js',
  'veritiles.js': 'veritiles/dist/veritiles.js',
};

// Lucide icons (ISC), 24px grid, stroked with currentColor.
const ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  'arrow-down': '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  github: '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
  'book-open': '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  map: '<path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z"/><path d="M15 5.764v15"/><path d="M9 3.236v15"/>',
};

function icon(name, size = 18) {
  if (!(name in ICONS)) throw new Error(`unknown icon ${name}`);
  const width = name === 'check' || name === 'x' ? 2.5 : 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

function escape(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Markdown, as much as the READMEs use -----------------------------------

// The fenced code blocks after a heading, up to the next heading of the same
// or a higher level.
function codeBlocks(md, heading) {
  const lines = md.split('\n');
  const start = lines.indexOf(heading);
  if (start < 0) throw new Error(`README heading not found: ${heading}`);
  const level = heading.match(/^#+/)[0].length;
  const blocks = [];
  let open = null;
  for (const line of lines.slice(start + 1)) {
    if (open === null && new RegExp(`^#{1,${level}} `).test(line)) break;
    if (line.startsWith('```')) {
      if (open === null) open = { lang: line.slice(3).trim(), lines: [] };
      else (blocks.push({ lang: open.lang, text: open.lines.join('\n') }), (open = null));
    } else if (open !== null) open.lines.push(line);
  }
  if (blocks.length === 0) throw new Error(`no code under ${heading}`);
  return blocks;
}

// The lines after a heading, up to the next heading or code fence.
function section(md, heading) {
  const lines = md.split('\n');
  const start = lines.indexOf(heading);
  if (start < 0) throw new Error(`README heading not found: ${heading}`);
  const end = lines.findIndex((line, i) => i > start && (/^#{1,6} /.test(line) || line.startsWith('```')));
  return lines.slice(start + 1, end < 0 ? undefined : end);
}

function paragraphs(lines) {
  return lines.join('\n').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

function inline(text) {
  return escape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => `<a href="${new URL(url, `${REPO}/blob/main/`).href}">${label}</a>`);
}

function table(lines) {
  const rows = lines.filter((line) => line.startsWith('|')).map((line) =>
    line.replace(/\\\|/g, '\u0000').slice(1, -1).split('|').map((cell) => cell.trim().replace(/\u0000/g, '|')));
  if (rows.length < 3) throw new Error('no table');
  const [head, , ...body] = rows;
  return { head, body };
}

function tableHtml({ head, body }) {
  const th = head.map((cell) => `<th scope="col">${inline(cell)}</th>`).join('');
  const tr = body.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('\n');
  return `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>\n${tr}\n</tbody></table></div>`;
}

// The README's bullet list after a paragraph: "- **Title** — text", one per
// item, continuation lines indented.
function bullets(md, after) {
  const lines = md.split('\n');
  const start = lines.findIndex((line) => line.startsWith(after));
  if (start < 0) throw new Error(`bullets not found after ${after}`);
  const items = [];
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('- ')) items.push(line.slice(2));
    else if (line.startsWith('  ') && items.length > 0) items[items.length - 1] += ` ${line.trim()}`;
    else if (items.length > 0) break;
  }
  return items.map((item) => {
    const match = /^\*\*(.+?)\*\* — (.*)$/.exec(item);
    if (match === null) throw new Error(`bullet without a title: ${item}`);
    return { title: match[1], text: match[2] };
  });
}

// --- Code ---------------------------------------------------------------------

// Each pattern's groups, in order: comment, string, keyword.
const STRING = String.raw`"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|\`(?:[^\`\\]|\\.)*\``;
const KEYWORD = String.raw`\b(?:import|from|const|let|new|await|async|export|return|function)\b`;
const TOKENS = {
  js: new RegExp(String.raw`(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(${STRING})|(${KEYWORD})`, 'g'),
  html: new RegExp(String.raw`(<!--[\s\S]*?-->|\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(${STRING})|(${KEYWORD})`, 'g'),
  sh: /(#[^\n]*)|("(?:[^"\\\n]|\\.)*")/g,
};

function highlight(text, lang) {
  const pattern = TOKENS[lang];
  if (pattern === undefined) return escape(text);
  let out = '';
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const [kind] = ['comment', 'string', 'keyword'].filter((_, i) => match[i + 1] !== undefined);
    out += escape(text.slice(last, match.index)) + `<span class="tok-${kind}">${escape(match[0])}</span>`;
    last = match.index + match[0].length;
  }
  return out + escape(text.slice(last));
}

function codeHtml({ lang, text }, label = 'Copy code') {
  return `<div class="code"><pre tabindex="0"><code>${highlight(text, lang)}</code></pre><button class="copy" type="button" aria-label="${label}" hidden>${icon('copy')}</button></div>`;
}

function installHtml(command, label = 'Copy install command') {
  return `<div class="install"><code><span class="prompt" aria-hidden="true">$ </span><span data-copy-text>${escape(command)}</span></code><button class="copy" type="button" aria-label="${label}" hidden>${icon('copy')}</button></div>`;
}

// --- Content from the READMEs ---------------------------------------------------

async function snippets() {
  const core = await readFile(join(modules, '@anymirror/core/README.md'), 'utf8');
  const veritiles = await readFile(join(modules, 'veritiles/README.md'), 'utf8');
  const readers = table(section(core, '# @anymirror/core'));
  const readerRows = Object.fromEntries(readers.body.map(([entry, reader, reads, size]) => [reader.replace(/`/g, ''), { entry, reads, size }]));
  const hosts = table(section(core, '## Hosts'));
  const pack = codeBlocks(core, '## Creating verified content');
  const install = codeBlocks(veritiles, '## Install');
  const intro = paragraphs(section(veritiles, '# veritiles'));
  return {
    'code:core-file': codeHtml(codeBlocks(core, '### A large file, by ranges')[0]),
    'code:core-pack-install': codeHtml(pack[0]),
    'code:core-pack': codeHtml(pack[1]),
    'code:vt-source': codeHtml(codeBlocks(veritiles, '# veritiles')[0]),
    'code:vt-script': codeHtml(install[1], 'Copy script tag'),
    'code:vt-maplibre': codeHtml(codeBlocks(veritiles, '### MapLibre GL')[0]),
    'code:vt-leaflet': codeHtml(codeBlocks(veritiles, '### Leaflet')[0]),
    'code:vt-openlayers': codeHtml(codeBlocks(veritiles, '### OpenLayers')[0]),
    'install:core': installHtml('npm install @anymirror/core'),
    'install:veritiles': installHtml(install[0].text.trim()),
    'table:hosts': tableHtml(hosts),
    'md:vt-intro': `<p class="lead">${inline(intro[0])}</p>`,
    'grid:vt-bullets': `<div class="grid-box"><ul class="grid">${bullets(veritiles, 'the sha2-256 chain rooted in the anchor').map(({ title, text }) => `<li><h3>${inline(title)}</h3><p>${inline(text)}</p></li>`).join('')}</ul></div>`,
    ...Object.fromEntries(Object.entries(readerRows).map(([reader, { entry, size }]) => [
      `reader:${reader}`,
      `<code class="entry">${escape(entry.replace(/`/g, ''))}</code><span class="size">${escape(`${size} gzipped`)}</span>`,
    ])),
  };
}

// --- Assembly ---------------------------------------------------------------------

function hash(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 10);
}

async function css() {
  const faces = FONTS.flatMap(([family, pkg, weights]) => weights.map((weight) =>
    `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url(/fonts/${pkg}-latin-${weight}-normal.woff2) format("woff2")}`)).join('\n');
  const tokens = await readFile(join(root, 'src/css/tokens.css'), 'utf8');
  const dark = /\[data-theme="dark"\] \{([^}]*)\}/.exec(tokens)?.[1];
  if (dark === undefined) throw new Error('tokens.css has no dark theme');
  // Paper sections follow the system: in dark mode they turn to ink, while
  // sections that set data-theme keep it.
  const system = `@media (prefers-color-scheme: dark) {\n  :root {${dark}}\n}`;
  const site = await readFile(join(root, 'src/css/site.css'), 'utf8');
  return [faces, tokens, system, site].join('\n\n');
}

async function render(name, meta, partials, values) {
  let body = await readFile(join(root, 'src/pages', name), 'utf8');
  const missing = [];
  const fill = (text) => text.replace(/\{\{([a-z]+:[A-Za-z0-9-]+)\}\}/g, (token, key) => {
    if (key.startsWith('icon:')) return icon(key.slice(5));
    if (key in values) return values[key];
    missing.push(key);
    return token;
  });
  body = fill(body);
  const canonical = `${SITE}${meta.path === '/' ? '/' : meta.path}`;
  const head = fill(partials.head)
    .replaceAll('%TITLE%', escape(meta.title))
    .replaceAll('%DESCRIPTION%', escape(meta.description))
    .replaceAll('%CANONICAL%', canonical);
  const page = `<!doctype html>\n<html lang="en">\n${head}\n<body>\n${fill(partials.nav)}\n<main id="main">\n${body}\n</main>\n${fill(partials.footer)}\n</body>\n</html>\n`;
  if (missing.length > 0) throw new Error(`${name}: unknown placeholders ${missing.join(', ')}`);
  return page;
}

async function main() {
  await rm(dist, { recursive: true, force: true });
  await cp(join(root, 'public'), dist, { recursive: true });

  await mkdir(join(dist, 'fonts'));
  for (const [, pkg, weights] of FONTS) {
    for (const weight of weights) {
      const file = `${pkg}-latin-${weight}-normal.woff2`;
      await cp(join(modules, '@fontsource', pkg, 'files', file), join(dist, 'fonts', file));
    }
  }
  await mkdir(join(dist, 'vendor'));
  for (const [file, from] of Object.entries(VENDOR)) await cp(join(modules, from), join(dist, 'vendor', file));

  const style = await css();
  const styleUrl = `/css/site.css?v=${hash(style)}`;
  await mkdir(join(dist, 'css'));
  await writeFile(join(dist, 'css/site.css'), style);
  await mkdir(join(dist, 'js'));
  const scripts = {};
  for (const file of await readdir(join(root, 'src/js'))) {
    const text = await readFile(join(root, 'src/js', file), 'utf8');
    await writeFile(join(dist, 'js', file), text);
    scripts[file] = `/js/${file}?v=${hash(text)}`;
  }

  const values = {
    ...(await snippets()),
    'asset:css': styleUrl,
    'asset:site-js': scripts['site.js'],
    'asset:map-js': scripts['map.js'],
    'preload:fonts': PRELOAD.map((file) => `<link rel="preload" href="/fonts/${file}" as="font" type="font/woff2" crossorigin>`).join('\n'),
  };
  const partials = {};
  for (const name of ['head', 'nav', 'footer']) partials[name] = await readFile(join(root, 'src/partials', `${name}.html`), 'utf8');
  for (const [name, meta] of Object.entries(PAGES)) await writeFile(join(dist, name), await render(name, meta, partials, values));
  console.log(`dist/: ${Object.keys(PAGES).length} pages`);
}

await main();
