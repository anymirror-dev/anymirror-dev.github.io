// Checks the built site in dist/ (run `npm run build` first) against the
// brief: one h1 a page, links and anchors that resolve, no request to any
// other origin but the live map's, code samples identical to the READMEs,
// colours from the tokens.
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';

const dist = new URL('../dist/', import.meta.url).pathname;
const PAGES = ['index.html', 'maps.html', 'docs.html', '404.html'];
const MAP_ORIGIN = 'https://guillaumemichel.github.io';
// The kit's component colours that have no token: hover and inner surfaces
// of the dark install box and buttons.
const KIT_COLOURS = new Set(['#24BF6F', '#2A2E36', '#22262E', '#171A20']);

const page = (name) => readFile(join(dist, name), 'utf8');
const exists = (path) => stat(path).then((s) => s.isFile(), () => false);

function text(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

// GitHub Pages: /maps is maps.html, / is index.html.
async function target(path) {
  const file = join(dist, path === '/' ? 'index.html' : path);
  if (await exists(file)) return file;
  if (await exists(`${file}.html`)) return `${file}.html`;
  return null;
}

test('each page has one h1, a title, a description and the social card', async () => {
  for (const name of PAGES) {
    const html = await page(name);
    assert.equal(html.match(/<h1[\s>]/g)?.length, 1, `${name}: one h1`);
    assert.match(html, /<title>[^<]+<\/title>/, name);
    assert.match(html, /<meta name="description" content="[^"]+">/, name);
    assert.match(html, /<meta property="og:image" content="https:\/\/anymirror\.dev\/social-card-1280x640\.png">/, name);
    assert.match(html, /<a class="skip" href="#main">/, name);
    assert.doesNotMatch(html, /\{\{|%[A-Z]+%/, `${name}: no placeholder left`);
  }
});

test('internal links and anchors resolve', async () => {
  for (const name of PAGES) {
    const html = await page(name);
    for (const [, href] of html.matchAll(/href="(\/[^"]*|#[^"]*)"/g)) {
      const [path, anchor] = href.split('#');
      const file = path === '' ? join(dist, name) : await target(path.split('?')[0]);
      assert.ok(file, `${name}: ${href} has no page`);
      if (anchor) assert.match(await readFile(file, 'utf8'), new RegExp(`id="${anchor}"`), `${name}: ${href} has no anchor`);
    }
  }
});

test('pages load nothing from another origin', async () => {
  for (const name of PAGES) {
    const html = await page(name);
    const loads = [
      ...[...html.matchAll(/<(?:script|img)[^>]* src="([^"]+)"/g)].map((m) => m[1]),
      ...[...html.matchAll(/<link [^>]*href="([^"]+)"/g)].filter((m) => !/rel="canonical"/.test(m[0])).map((m) => m[1]),
    ];
    for (const url of loads) assert.match(url, /^\/[^/]/, `${name} loads ${url}`);
  }
  const css = await readFile(join(dist, 'css/site.css'), 'utf8');
  for (const [, url] of css.matchAll(/url\(([^)]+)\)/g)) assert.match(url, /^\/[^/]/, `site.css loads ${url}`);
  const scripts = await Promise.all(['js/site.js', 'js/map.js'].map((file) => readFile(join(dist, file), 'utf8')));
  assert.doesNotMatch(scripts[0], /https?:\/\//, 'site.js names no origin');
  const origins = new Set([...scripts[1].matchAll(/['`](https:\/\/[^/'`]+)/g)].map((m) => m[1]));
  assert.deepEqual([...origins], [MAP_ORIGIN], 'map.js reads from the map demo only');
});

test('code samples are the READMEs\' own', async () => {
  const core = await readFile(new URL('../node_modules/@anymirror/core/README.md', import.meta.url), 'utf8');
  const sample = /### A large file, by ranges\n\n```js\n([\s\S]*?)\n```/.exec(core)[1];
  assert.ok(text(await page('index.html')).includes(sample), 'the home page shows the README sample');
  const veritiles = await readFile(new URL('../node_modules/veritiles/README.md', import.meta.url), 'utf8');
  const maplibre = /### MapLibre GL\n\n```html\n([\s\S]*?)\n```/.exec(veritiles)[1];
  assert.ok(text(await page('maps.html')).includes(maplibre), 'the maps page shows the README sample');
});

test('colours come from the tokens', async () => {
  const site = await readFile(new URL('../src/css/site.css', import.meta.url), 'utf8');
  const stray = [...site.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map((m) => m[0]).filter((hex) => !KIT_COLOURS.has(hex));
  assert.deepEqual(stray, []);
});

// dist/ served from disk: whole files, or one byte range.
function localFetch(url, init = {}) {
  const path = decodeURIComponent(new URL(url).pathname);
  return readFile(join(dist, path)).then((bytes) => {
    const range = /bytes=(\d+)-(\d+)/.exec(init.headers?.Range ?? init.headers?.range ?? '');
    if (range === null) return new Response(bytes, { status: 200 });
    return new Response(bytes.subarray(Number(range[1]), Number(range[2]) + 1), { status: 206 });
  }, () => new Response('', { status: 404 }));
}

test('the mirror serves the map demo under the anchors of mirror.json', async () => {
  const { VerifiedBundle, VerifiedFile, VerifiedRaw } = await import('@anymirror/core');
  const { path, anchors } = JSON.parse(await readFile(new URL('../mirror.json', import.meta.url), 'utf8'));
  const base = `https://anymirror.dev/${path}/`;
  for (const [key, file] of [['map', 'map.pmtiles'], ['elevation', 'elevation.pmtiles']]) {
    const archive = new VerifiedFile({ cid: anchors[key], source: base + file, fetchFn: localFetch });
    await archive.ready();
    for (const offset of [0, Math.floor(archive.size / 2), archive.size - 4096]) await archive.read(offset, 4096);
    assert.equal(archive.stats.rejected, 0, file);
  }
  await new VerifiedRaw({ cid: anchors.style, source: `${base}assets/style.json`, fetchFn: localFetch }).bytes();
  const fonts = new VerifiedBundle({ cid: anchors.fonts, source: `${base}assets/fonts`, proof: `${base}assets/fonts.car`, fetchFn: localFetch });
  await fonts.bytes('Noto Sans Regular/0-255.pbf');
  const sprites = new VerifiedBundle({ cid: anchors.sprites, source: `${base}assets/sprites`, proof: `${base}assets/sprites.car`, fetchFn: localFetch });
  await sprites.bytes('light.json');

  const live = await readFile(join(dist, 'js/map.js'), 'utf8');
  for (const key of ['map', 'style', 'fonts', 'sprites']) assert.match(live, new RegExp(`${key}: '${anchors[key]}'`), `map.js reads the mirrored ${key}`);
});

test('crawlers and agents find every page, the docs and the mirror', async () => {
  const robots = await readFile(join(dist, 'robots.txt'), 'utf8');
  assert.match(robots, /^User-agent: \*\nAllow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/anymirror\.dev\/sitemap\.xml$/m);
  const sitemap = await readFile(join(dist, 'sitemap.xml'), 'utf8');
  const listed = [...sitemap.matchAll(/<loc>https:\/\/anymirror\.dev(\/[^<]*)<\/loc>/g)].map((m) => m[1]);
  assert.deepEqual(listed, ['/', '/maps', '/docs']);
  for (const path of listed) assert.ok(await target(path), `${path} exists`);
  const llms = await readFile(join(dist, 'llms.txt'), 'utf8');
  assert.match(llms, /^# anymirror\n\n> /);
  for (const [, url] of llms.matchAll(/\]\((https:\/\/anymirror\.dev\/[^)#]*)/g)) assert.ok(await target(new URL(url).pathname), `llms.txt links ${url}`);
});
