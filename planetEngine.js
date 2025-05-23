const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const RESOLUTION = 100;
const UPDATE_INTERVAL_MS = 60 * 1000; // 1 minute
const SAVE_PNG = true; // set to false to disable png saving

const TERRAIN_FILE = path.join(__dirname, 'terrain.gltf');
const TERRAIN_SCALE = 50; // must match scale used in client

function loadTerrainBounds() {
  try {
    const data = JSON.parse(fs.readFileSync(TERRAIN_FILE, 'utf8'));
    const accessor = data.accessors && data.accessors[0];
    if (accessor && accessor.min && accessor.max) {
      return {
        minX: accessor.min[0] * TERRAIN_SCALE,
        maxX: accessor.max[0] * TERRAIN_SCALE,
        minY: accessor.min[2] * TERRAIN_SCALE,
        maxY: accessor.max[2] * TERRAIN_SCALE
      };
    }
  } catch (err) {}
  return { minX: 0, maxX: RESOLUTION, minY: 0, maxY: RESOLUTION };
}

// simple deterministic random generator (mulberry32)
function createPRNG(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// crc32 helper for png encoding
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

class PlanetEngine {
  constructor(saveDir = __dirname, savePng = SAVE_PNG) {
    this.saveDir = saveDir;
    this.savePng = savePng;
    this.resolution = RESOLUTION;
    this.seed = 123456789;
    this.rand = createPRNG(this.seed);
    this.bounds = loadTerrainBounds();
    this.width = this.bounds.maxX - this.bounds.minX;
    this.height = this.bounds.maxY - this.bounds.minY;
    this.maps = {
      temperature: this._createMap(),
      humidity: this._createMap(),
      soilSoftness: this._createMap(),
      earthquake: this._createMap(),
      uv: this._createMap(),
      dangerousChemicals: this._createMap(),
      rareMinerals: this._createMap(),
      radioactiveMaterials: this._createMap()
    };
    this._initMaps();
    this._start();
  }

  _createMap() {
    const arr = new Array(this.resolution);
    for (let i = 0; i < this.resolution; i++) {
      arr[i] = new Array(this.resolution).fill(0);
    }
    return arr;
  }

  _initMaps() {
    Object.values(this.maps).forEach(map => {
      for (let y = 0; y < this.resolution; y++) {
        for (let x = 0; x < this.resolution; x++) {
          map[y][x] = this.rand();
        }
      }
    });
    if (this.savePng) this._saveAll();
  }

  _updateMap(map) {
    for (let y = 0; y < this.resolution; y++) {
      for (let x = 0; x < this.resolution; x++) {
        const v = map[y][x] + (this.rand() - 0.5) * 0.05;
        map[y][x] = clamp(v, 0, 1);
      }
    }
  }

  _start() {
    setInterval(() => {
      Object.values(this.maps).forEach(m => this._updateMap(m));
      if (this.savePng) this._saveAll();
    }, UPDATE_INTERVAL_MS);
  }

  _pngChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const name = Buffer.from(type);
    const crcBuf = Buffer.concat([name, data]);
    const crc = crc32(crcBuf);
    const crcOut = Buffer.alloc(4);
    crcOut.writeUInt32BE(crc, 0);
    return Buffer.concat([len, name, data, crcOut]);
  }

  _mapToPNGBuffer(map) {
    const width = this.resolution;
    const height = this.resolution;
    const raw = Buffer.alloc((width + 1) * height);
    let p = 0;
    for (let y = 0; y < height; y++) {
      raw[p++] = 0; // no filter
      for (let x = 0; x < width; x++) {
        raw[p++] = Math.round(clamp(map[y][x], 0, 1) * 255);
      }
    }
    const idat = zlib.deflateSync(raw);
    const ihdrData = Buffer.alloc(13);
    ihdrData.writeUInt32BE(width, 0);
    ihdrData.writeUInt32BE(height, 4);
    ihdrData[8] = 8; // bit depth
    ihdrData[9] = 0; // color type grayscale
    ihdrData[10] = 0; // compression
    ihdrData[11] = 0; // filter
    ihdrData[12] = 0; // no interlace
    const chunks = [
      this._pngChunk('IHDR', ihdrData),
      this._pngChunk('IDAT', idat),
      this._pngChunk('IEND', Buffer.alloc(0))
    ];
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ...chunks
    ]);
  }

  _saveMap(name, map) {
    const buf = this._mapToPNGBuffer(map);
    fs.writeFileSync(path.join(this.saveDir, `${name}.png`), buf);
  }

  _saveAll() {
    for (const [name, map] of Object.entries(this.maps)) {
      this._saveMap(name, map);
    }
  }

  getProperties(x, y, props) {
    // x and y are world coordinates relative to terrain
    const nx = (x - this.bounds.minX) / this.width;
    const ny = (y - this.bounds.minY) / this.height;
    const ix = Math.floor(clamp(nx * (this.resolution - 1), 0, this.resolution - 1));
    const iy = Math.floor(clamp(ny * (this.resolution - 1), 0, this.resolution - 1));
    const all = {
      temperature: this.maps.temperature[iy][ix],
      humidity: this.maps.humidity[iy][ix],
      soilSoftness: this.maps.soilSoftness[iy][ix],
      earthquake: this.maps.earthquake[iy][ix],
      uv: this.maps.uv[iy][ix],
      dangerousChemicals: this.maps.dangerousChemicals[iy][ix],
      rareMinerals: this.maps.rareMinerals[iy][ix],
      radioactiveMaterials: this.maps.radioactiveMaterials[iy][ix]
    };
    if (!props) return all;
    const result = {};
    props.forEach(p => {
      if (p in all) result[p] = all[p];
    });
    return result;
  }
}

module.exports = PlanetEngine;

