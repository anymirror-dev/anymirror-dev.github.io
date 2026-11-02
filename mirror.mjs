// Mirrors the map demo's small set into dist/mirror/map-demo/, under the
// demo's own layout, so anymirror.dev serves the same CIDs: another location
// for the demo, a source for anyone, and the first one /maps reads.
//
// Every byte is read through the anymirror readers before it is written, so
// a build never publishes what does not match the anchors in mirror.json.
// Reading an archive whole also fetches every proof file it has: those are
// recorded on the way and written beside it. The hints documents are copied
// as they are; they are untrusted by design.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { VerifiedBundle, VerifiedFile, VerifiedRaw } from '@anymirror/core';

const READ_CHUNK = 8 * 1024 * 1024;
const SPRITE_FILES = ['light.json', 'light.png', 'light@2x.json', 'light@2x.png'];

async function save(out, path, bytes) {
  const target = join(out, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

async function fetchOk(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

// A ranged archive and its proof directory.
async function archive(from, out, cid, path) {
  const proofs = new Map();
  const prefix = `${from}${path}.proofs/`;
  const fetchFn = async (url, init) => {
    const res = await fetch(url, init);
    if (res.ok && String(url).startsWith(prefix)) proofs.set(String(url).slice(from.length), new Uint8Array(await res.clone().arrayBuffer()));
    return res;
  };
  const file = new VerifiedFile({ cid, source: `${from}${path}`, fetchFn });
  await file.ready();
  const bytes = new Uint8Array(file.size);
  for (let offset = 0; offset < file.size; offset += READ_CHUNK) {
    bytes.set(await file.read(offset, Math.min(READ_CHUNK, file.size - offset)), offset);
  }
  if (file.stats.rejected !== 0) throw new Error(`${path}: the demo served bytes that failed verification`);
  await save(out, path, bytes);
  for (const [proof, body] of proofs) await save(out, proof, body);
  return { path, bytes: bytes.length, proofs: proofs.size };
}

// A bundle's CAR, and each file the bundle names that is published beside it.
async function bundle(from, out, cid, dir, paths) {
  const car = `${dir}.car`;
  const reader = new VerifiedBundle({ cid, source: `${from}${dir}`, proof: `${from}${car}` });
  for (const path of paths.files) await save(out, `${dir}/${path}`, await reader.bytes(path));
  for (const path of paths.inCar) await reader.bytes(path);
  await save(out, car, await fetchOk(`${from}${car}`));
  return { path: car, files: paths.files.length + paths.inCar.length };
}

// The glyph paths the demo's discovery document names, as bundle paths.
function glyphPaths(hints) {
  return Object.values(hints.hints).flat().map((url) => url.replace(/^fonts\//, '').split('/').map(decodeURIComponent).join('/'));
}

export async function mirror(dist) {
  const config = JSON.parse(await readFile(new URL('./mirror.json', import.meta.url), 'utf8'));
  const { from, anchors } = config;
  const out = join(dist, config.path);
  const glyphHints = await fetchOk(`${from}assets/hints.json`);

  const done = [
    await archive(from, out, anchors.map, 'map.pmtiles'),
    await archive(from, out, anchors.elevation, 'elevation.pmtiles'),
    await bundle(from, out, anchors.fonts, 'assets/fonts', { files: glyphPaths(JSON.parse(new TextDecoder().decode(glyphHints))), inCar: [] }),
    await bundle(from, out, anchors.sprites, 'assets/sprites', { files: [], inCar: SPRITE_FILES }),
  ];
  await save(out, 'assets/style.json', await new VerifiedRaw({ cid: anchors.style, source: `${from}assets/style.json` }).bytes());
  await save(out, 'assets/hints.json', glyphHints);
  await save(out, 'hints.json', await fetchOk(`${from}hints.json`));
  for (const { path, ...counts } of done) console.log(`mirror: ${path} ${JSON.stringify(counts)}`);
}
