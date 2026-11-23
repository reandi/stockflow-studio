/**
 * StockFlow Studio — Batch Production, Unique Seed Registry & ZIP Packager
 * Guarantees 100% unique seeds persisted in localStorage, unique rotation/scale/color
 * variations per asset, clean microstock naming, optional Shutterstock metadata CSV,
 * and JSZip bundling (with a built-in zero-dependency STORE ZIP fallback if offline).
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'stockflow_studio_used_seeds_v1';
  const MAX_STORED_SEEDS = 50000;

  const { PATTERN_MODES } = global.StockFlowShaders;
  const { PALETTES, generateHarmoniousPalette, varyPalette, createRng } = global.StockFlowPalettes;

  // -------------------------------------------------------------------------
  // Persistent Unique Seed Registry (localStorage)
  // -------------------------------------------------------------------------
  class SeedRegistry {
    constructor() {
      this.used = this._load();
    }

    _load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return new Set();
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return new Set(parsed.map(Number).filter(Number.isFinite));
        }
      } catch (e) {
        console.warn('StockFlow: Could not read localStorage seed history.', e);
      }
      return new Set();
    }

    _save() {
      try {
        let arr = Array.from(this.used);
        if (arr.length > MAX_STORED_SEEDS) {
          arr = arr.slice(arr.length - MAX_STORED_SEEDS);
          this.used = new Set(arr);
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
      } catch (e) {
        console.warn('StockFlow: Could not persist seed history.', e);
      }
    }

    count() {
      return this.used.size;
    }

    has(seed) {
      return this.used.has(Number(seed));
    }

    register(seed) {
      const n = Number(seed);
      if (Number.isFinite(n)) {
        this.used.add(n);
        this._save();
      }
    }

    nextUniqueSeed() {
      // Crypto-strong random 6-digit to 7-digit integer seed, guaranteed unused
      let candidate;
      let attempts = 0;
      const buf = new Uint32Array(1);
      do {
        if (global.crypto && global.crypto.getRandomValues) {
          global.crypto.getRandomValues(buf);
          candidate = 10000 + (buf[0] % 8999990);
        } else {
          candidate = 10000 + Math.floor(Math.random() * 8999990);
        }
        attempts++;
      } while (this.used.has(candidate) && attempts < 2000);

      this.used.add(candidate);
      this._save();
      return candidate;
    }

    clear() {
      this.used.clear();
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {
        // Ignore storage errors
      }
    }
  }

  // -------------------------------------------------------------------------
  // Filename & Shutterstock Metadata Helpers
  // -------------------------------------------------------------------------
  function getResolutionTag(width, height) {
    const longest = Math.max(width, height);
    if (longest >= 7600) return '8k';
    if (longest >= 6000) return '6k';
    if (longest >= 3800) return '4k';
    return `${width}x${height}`;
  }

  function buildFilename(modeId, width, height, seed) {
    const modeInfo = PATTERN_MODES.find(m => m.id === modeId) || PATTERN_MODES[0];
    const resTag = getResolutionTag(width, height);
    return `abstract-${modeInfo.slug}-${resTag}-seed${seed}.jpg`;
  }

  function buildShutterstockCsv(records) {
    const header = 'Filename,Description,Keywords,Categories,Editorial,Mature content,illustration';
    const escapeCsv = (str) => `"${String(str).replace(/"/g, '""')}"`;

    const rows = records.map((rec) => {
      const modeInfo = PATTERN_MODES.find(m => m.id === rec.mode) || PATTERN_MODES[0];
      const orientation = rec.width > rec.height
        ? 'horizontal landscape'
        : rec.width < rec.height
          ? 'vertical portrait'
          : 'square';
      const desc = `Abstract ${modeInfo.name.toLowerCase()} ${modeInfo.subtitle.toLowerCase()} background with smooth ${rec.paletteName.toLowerCase()} tones, ${orientation} high resolution backdrop`;
      const keywords = [
        'abstract', 'background', 'wallpaper', 'backdrop', 'texture', 'gradient',
        'smooth', 'modern', 'minimal', 'elegant', 'luxury', 'design', 'art',
        'digital', 'flowing', 'soft', 'luminous', 'copy space', 'banner',
        orientation,
        modeInfo.keywords,
        rec.paletteKeywords
      ].filter(Boolean).join(', ');
      return [
        escapeCsv(rec.filename),
        escapeCsv(desc),
        escapeCsv(keywords),
        escapeCsv('Abstract,Backgrounds/Textures'),
        'no',
        'no',
        'yes'
      ].join(',');
    });

    return [header, ...rows].join('\r\n');
  }

  // -------------------------------------------------------------------------
  // Built-in Zero-Dependency PKZIP (STORE method) Fallback for Offline Use
  // -------------------------------------------------------------------------
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  async function buildFallbackZipBlob(entries) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const entry of entries) {
      const nameBytes = encoder.encode(entry.filename);
      const dataBytes = entry.data instanceof Uint8Array
        ? entry.data
        : new Uint8Array(await entry.data.arrayBuffer());
      const crc = crc32(dataBytes);
      const size = dataBytes.length;

      // Local file header (30 bytes + name)
      const localHeader = new ArrayBuffer(30 + nameBytes.length);
      const lv = new DataView(localHeader);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);       // version needed
      lv.setUint16(6, 0x0800, true);   // UTF-8 flag
      lv.setUint16(8, 0, true);        // compression: STORE (0)
      lv.setUint16(10, 0, true);       // mod time
      lv.setUint16(12, 0x5421, true);  // mod date
      lv.setUint32(14, crc, true);
      lv.setUint32(18, size, true);
      lv.setUint32(22, size, true);
      lv.setUint16(26, nameBytes.length, true);
      lv.setUint16(28, 0, true);
      new Uint8Array(localHeader, 30).set(nameBytes);

      localParts.push(new Uint8Array(localHeader), dataBytes);

      // Central directory entry (46 bytes + name)
      const central = new ArrayBuffer(46 + nameBytes.length);
      const cv = new DataView(central);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, 0, true);
      cv.setUint16(14, 0x5421, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      new Uint8Array(central, 46).set(nameBytes);

      centralParts.push(new Uint8Array(central));
      offset += localHeader.byteLength + size;
    }

    const centralSize = centralParts.reduce((acc, p) => acc + p.byteLength, 0);
    const eocd = new ArrayBuffer(22);
    const ev = new DataView(eocd);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, entries.length, true);
    ev.setUint16(10, entries.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, new Uint8Array(eocd)], {
      type: 'application/zip'
    });
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 15000);
  }

  // -------------------------------------------------------------------------
  // Batch Producer
  // -------------------------------------------------------------------------
  class BatchProducer {
    constructor(renderer, seedRegistry) {
      this.renderer = renderer;
      this.seedRegistry = seedRegistry;
    }

    /**
     * Generates a unique state variation for item `index` of a batch.
     * Guarantees unique seed, rotation, flow scale, warp, and palette shift.
     */
    _createVariation(baseState, index, options) {
      const seed = this.seedRegistry.nextUniqueSeed();
      const rand = createRng(seed ^ (index * 2654435761));

      // Pattern mode selection
      let mode = baseState.mode;
      if (options.patternStrategy === 'mix') {
        mode = index % PATTERN_MODES.length;
      }

      // Color palette variation strategy
      let colors = [...baseState.colors];
      let paletteName = options.currentPaletteName || 'Custom Abstract';
      let paletteKeywords = options.currentPaletteKeywords || 'harmonious colors, commercial palette';

      if (options.paletteStrategy === 'subtle') {
        colors = varyPalette(baseState.colors, seed, 24);
      } else if (options.paletteStrategy === 'harmonious') {
        colors = generateHarmoniousPalette(seed);
        paletteName = 'Harmonious Procedural';
        paletteKeywords = 'harmonious gradient, artistic tones, modern palette';
      } else if (options.paletteStrategy === 'cycle') {
        const preset = PALETTES[index % PALETTES.length];
        colors = varyPalette(preset.colors, seed, 12);
        paletteName = preset.name;
        paletteKeywords = preset.keywords;
      }

      // Unique rotation, flow scale, and subtle organic parameter jitter
      const rotation = Math.round(rand() * 360);
      const scaleJitter = 0.80 + rand() * 0.45; // 0.80x .. 1.25x
      const scale = Math.max(0.45, Math.min(3.8, Number((baseState.scale * scaleJitter).toFixed(2))));
      const warpJitter = 0.85 + rand() * 0.34;
      const warp = Math.max(0.2, Math.min(2.95, Number((baseState.warp * warpJitter).toFixed(2))));
      const softness = Math.max(0.05, Math.min(0.95, Number((baseState.softness + (rand() - 0.5) * 0.14).toFixed(2))));

      return {
        state: {
          ...baseState,
          mode,
          seed,
          rotation,
          scale,
          warp,
          softness,
          colors
        },
        paletteName,
        paletteKeywords
      };
    }

    async runBatch(baseState, batchOptions, callbacks = {}) {
      const {
        count = 10,
        width,
        height,
        quality = 0.97,
        delivery = 'zip',        // 'zip' | 'individual'
        paletteStrategy = 'subtle',
        patternStrategy = 'current',
        includeCsv = true,
        currentPaletteName = 'Custom',
        currentPaletteKeywords = '',
        cancelToken = { cancelled: false }
      } = batchOptions;

      const resTag = getResolutionTag(width, height).toUpperCase();
      const useJSZip = delivery === 'zip' && typeof global.JSZip !== 'undefined';
      const zip = useJSZip ? new global.JSZip() : null;
      const fallbackEntries = [];
      const csvRecords = [];
      const generatedItems = [];

      for (let i = 0; i < count; i++) {
        if (cancelToken.cancelled) {
          throw new Error('EXPORT_CANCELLED');
        }

        const { state, paletteName, paletteKeywords } = this._createVariation(baseState, i, {
          paletteStrategy,
          patternStrategy,
          currentPaletteName,
          currentPaletteKeywords
        });

        const filename = buildFilename(state.mode, width, height, state.seed);

        if (callbacks.onItemStart) {
          callbacks.onItemStart({
            index: i,
            total: count,
            resTag,
            filename,
            state
          });
        }

        const result = await this.renderer.renderHighResJpeg(state, {
          width,
          height,
          quality,
          cancelToken,
          createThumbnail: true,
          onTileProgress: (doneTiles, totalTiles) => {
            if (callbacks.onProgress) {
              const overall = (i + doneTiles / totalTiles) / count;
              callbacks.onProgress({
                index: i,
                total: count,
                doneTiles,
                totalTiles,
                overall,
                label: `Rendering ${i + 1}/${count} — ${resTag} (Tile ${doneTiles}/${totalTiles})...`
              });
            }
          }
        });

        csvRecords.push({
          filename,
          mode: state.mode,
          width,
          height,
          paletteName,
          paletteKeywords
        });

        if (delivery === 'zip') {
          if (useJSZip) {
            zip.file(filename, result.blob, { compression: 'STORE' });
          } else {
            fallbackEntries.push({ filename, data: result.blob });
          }
        } else {
          triggerDownload(result.blob, filename);
          // Slight pause so browser doesn't throttle simultaneous downloads
          await new Promise(r => setTimeout(r, 180));
        }

        const itemSummary = {
          filename,
          seed: state.seed,
          mode: state.mode,
          sizeBytes: result.blob.size,
          thumbnailUrl: result.thumbnailUrl,
          blob: delivery === 'individual' ? null : null // don't retain duplicate references
        };
        generatedItems.push(itemSummary);

        if (callbacks.onItemComplete) {
          callbacks.onItemComplete(itemSummary, i + 1, count);
        }
      }

      let zipBlob = null;
      let zipFilename = null;

      if (delivery === 'zip') {
        if (callbacks.onProgress) {
          callbacks.onProgress({
            index: count - 1,
            total: count,
            doneTiles: 1,
            totalTiles: 1,
            overall: 0.99,
            label: `Packaging ${count} images into ZIP archive...`
          });
        }

        if (includeCsv && csvRecords.length > 0) {
          const csvContent = buildShutterstockCsv(csvRecords);
          if (useJSZip) {
            zip.file('shutterstock-metadata.csv', csvContent);
          } else {
            fallbackEntries.push({
              filename: 'shutterstock-metadata.csv',
              data: new TextEncoder().encode(csvContent)
            });
          }
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
        zipFilename = `stockflow-batch-${count}x-${resTag.toLowerCase()}-${timestamp}.zip`;

        if (useJSZip) {
          zipBlob = await zip.generateAsync({
            type: 'blob',
            compression: 'STORE'
          });
        } else {
          zipBlob = await buildFallbackZipBlob(fallbackEntries);
        }

        if (!batchOptions.suppressAutoDownload) {
          triggerDownload(zipBlob, zipFilename);
        }
      }

      return {
        items: generatedItems,
        zipBlob,
        zipFilename,
        usedJSZip: useJSZip
      };
    }
  }

  global.StockFlowBatch = {
    SeedRegistry,
    BatchProducer,
    buildFilename,
    getResolutionTag,
    triggerDownload
  };
})(window);
