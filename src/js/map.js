// The live map on /maps: the map demo's small set, read through veritiles.
// Nothing loads until the visitor asks: MapLibre comes from this site, the
// map's files from the demo on GitHub Pages, located by its hints document
// and every byte checked against the CIDs below.

const DEMO = 'https://guillaumemichel.github.io/ipfs-pmtiles-demo/';
const ANCHORS = {
  map: 'bafyreif33ppi5uijec33dywz6z5cvdzmqd4vxvwof3eaveaedxfbbbur4e',
  style: 'bafkreihjkd3epjd4jlds5yv5ziqg7umd5sliwcvmwrfgqghuyy6km4k6ie',
  fonts: 'bafyreigr3kszmxht36pxnoddfdraxqnyy4x7ylnqyfnubenpdyqftozamm',
  sprites: 'bafyreiaqclllimqvvs2g6de3lsets5eipabbwc5bsmdq7yibnkfboot6sm',
};
const ATTRIBUTION = '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>';
const STATS_EVERY_MS = 500;

const root = document.querySelector('[data-live-map]');
const start = root.querySelector('.live-start');
const status = root.querySelector('.live-status');
const verifiedChip = root.querySelector('[data-verified]');
const rejectedChip = root.querySelector('[data-rejected]');

function script(src) {
  return new Promise((resolve, reject) => {
    const element = Object.assign(document.createElement('script'), { src, onload: resolve, onerror: () => reject(new Error(`${src} did not load`)) });
    document.head.append(element);
  });
}

function stylesheet(href) {
  document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href }));
}

// The demo's style without its terrain: the elevation archive stays unread.
function withoutTerrain(style) {
  const dem = new Set(Object.keys(style.sources).filter((id) => style.sources[id].type === 'raster-dem'));
  const { terrain, ...rest } = style;
  return {
    ...rest,
    sources: Object.fromEntries(Object.entries(style.sources).filter(([id]) => !dem.has(id))),
    layers: style.layers.filter((layer) => !dem.has(layer.source)),
  };
}

function showStats(readers) {
  const sum = (key) => readers.reduce((total, reader) => total + reader.stats[key], 0);
  const verified = sum('verified');
  const rejected = sum('rejected');
  verifiedChip.hidden = false;
  verifiedChip.lastElementChild.textContent = `verified · ${verified}`;
  rejectedChip.hidden = rejected === 0;
  rejectedChip.lastElementChild.textContent = `rejected · ${rejected}`;
}

async function load() {
  start.disabled = true;
  status.textContent = 'Loading MapLibre…';
  stylesheet('/vendor/maplibre-gl.css');
  const [maplibregl] = await Promise.all([import('/vendor/maplibre-gl.mjs'), script('/vendor/pmtiles.js'), script('/vendor/veritiles.js')]);
  const { pmtiles, veritiles } = window;

  status.textContent = 'Opening the map: its descriptor first, checked against the CID…';
  const hints = `${DEMO}hints.json`;
  const map = new veritiles.VerifiedSource({ cid: ANCHORS.map, hints });
  const style = new veritiles.VerifiedAsset({ cid: ANCHORS.style, hints });
  const fonts = new veritiles.VerifiedAsset({ cid: ANCHORS.fonts, hints });
  const sprites = new veritiles.VerifiedAsset({ cid: ANCHORS.sprites, hints });
  const readers = [map, style, fonts, sprites];

  const protocol = new pmtiles.Protocol();
  protocol.add(new pmtiles.PMTiles(map));
  maplibregl.addProtocol('pmtiles', protocol.tile);
  maplibregl.addProtocol('verified', veritiles.assetProtocol([fonts, sprites]));
  const verifiedStyle = JSON.parse(new TextDecoder().decode(await style.bytes('')));

  const container = root.querySelector('#live-map');
  container.hidden = false;
  start.hidden = true;
  const view = new maplibregl.Map({
    container,
    style: withoutTerrain(verifiedStyle),
    center: [8.5, 47],
    zoom: 1.6,
    attributionControl: { customAttribution: ATTRIBUTION },
    cooperativeGestures: true,
  });
  view.addControl(new maplibregl.NavigationControl({ visualizePitch: true }));
  view.once('load', () => {
    root.querySelector('.live-preview').hidden = true;
    status.textContent = 'Every tile, glyph and sprite on screen passed its hash check.';
  });
  showStats(readers);
  setInterval(() => showStats(readers), STATS_EVERY_MS);
}

start.hidden = false;
start.addEventListener('click', () => {
  load().catch((err) => {
    console.error(err);
    start.disabled = false;
    status.textContent = `The map did not load: ${err.message}`;
  });
});
