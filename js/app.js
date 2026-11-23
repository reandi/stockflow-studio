/**
 * StockFlow Studio — Main UI Controller & Live Preview Orchestrator
 */
(function (global) {
  'use strict';

  const { PALETTES, generateHarmoniousPalette } = global.StockFlowPalettes;
  const { PATTERN_MODES } = global.StockFlowShaders;
  const StockFlowRenderer = global.StockFlowRenderer;
  const { SeedRegistry, BatchProducer, buildFilename, getResolutionTag, triggerDownload } = global.StockFlowBatch;

  const DEFAULT_STATE = {
    mode: 0, // Ethereal Silk
    paletteId: 'pastel-dream',
    colors: [...PALETTES[0].colors],
    complexity: 4.0,
    scale: 1.15,
    warp: 1.35,
    softness: 0.48,
    contrast: 1.05,
    rotation: 24,
    dither: 1.0,
    seed: 482913,
    aspect: '16:9',
    resolution: 7680, // 8K default
    customW: 5000,
    customH: 3334,
    jpgQuality: 0.97,
    batchCount: 10
  };

  let state = { ...DEFAULT_STATE, colors: [...DEFAULT_STATE.colors] };
  let renderer = null;
  let seedRegistry = null;
  let batchProducer = null;
  let activeCancelToken = null;
  let isRendering = false;
  let toastTimer = null;
  let rafScheduled = false;

  // DOM References
  const el = {};

  function cacheDom() {
    const ids = [
      'gpuBadge', 'gpuDot', 'gpuStatusText',
      'patternGrid', 'btnApplyModeDefaults',
      'paletteGrid', 'btnHarmoniousPalette',
      'colorPicker0', 'colorPicker1', 'colorPicker2', 'colorPicker3',
      'colorHex0', 'colorHex1', 'colorHex2', 'colorHex3',
      'sliderComplexity', 'valComplexity',
      'sliderScale', 'valScale',
      'sliderWarp', 'valWarp',
      'sliderSoftness', 'valSoftness',
      'sliderContrast', 'valContrast',
      'sliderRotation', 'valRotation',
      'sliderDither', 'valDither',
      'inputSeed', 'btnRandomSeed', 'btnRandomSeedInline',
      'aspectGroup', 'customDimRow', 'inputCustomW', 'inputCustomH',
      'resGroup', 'specDims', 'specMeta',
      'sliderJpgQuality', 'valJpgQuality',
      'btnExportSingle', 'singleResTag',
      'inputBatchCount', 'selectDelivery', 'selectPaletteStrategy',
      'selectPatternStrategy', 'chkIncludeCsv',
      'btnGenerateBatch', 'batchBtnCount', 'batchBtnRes',
      'seedHistoryCount', 'btnClearSeedHistory',
      'topDims', 'topMp', 'topMode', 'topSeed',
      'btnRandomizeAll', 'btnToggleDither', 'btnResetDefaults',
      'viewport', 'canvasFrame', 'previewCanvas', 'ditherBadge',
      'progressOverlay', 'progressTitle', 'progressPct',
      'progressStatus', 'progressFill', 'progressSub', 'btnCancelRender',
      'batchStrip', 'batchStripSummary', 'batchThumbs', 'btnClearBatchStrip',
      'toast'
    ];
    for (const id of ids) {
      el[id] = document.getElementById(id);
    }
  }

  function showToast(message, isError = false) {
    el.toast.textContent = message;
    el.toast.classList.toggle('error', isError);
    el.toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.toast.classList.remove('visible');
    }, isError ? 4600 : 3000);
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function getOutputDimensions() {
    return StockFlowRenderer.computeDimensions(
      state.aspect,
      state.resolution,
      state.customW,
      state.customH
    );
  }

  // -------------------------------------------------------------------------
  // Build Dynamic UI Controls
  // -------------------------------------------------------------------------
  function buildPatternButtons() {
    el.patternGrid.innerHTML = '';
    for (const mode of PATTERN_MODES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pattern-btn' + (mode.id === state.mode ? ' active' : '');
      btn.dataset.mode = String(mode.id);
      btn.innerHTML = `
        <span class="pattern-name">${mode.name}</span>
        <span class="pattern-sub">${mode.subtitle}</span>
      `;
      btn.addEventListener('click', () => {
        state.mode = mode.id;
        syncUI();
        scheduleRender();
      });
      el.patternGrid.appendChild(btn);
    }
  }

  function buildPaletteChips() {
    el.paletteGrid.innerHTML = '';
    for (const pal of PALETTES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'palette-chip' + (pal.id === state.paletteId ? ' active' : '');
      btn.dataset.palette = pal.id;
      const grad = `linear-gradient(90deg, ${pal.colors[0]} 0%, ${pal.colors[1]} 35%, ${pal.colors[2]} 68%, ${pal.colors[3]} 100%)`;
      btn.innerHTML = `
        <span class="palette-strip" style="background: ${grad};"></span>
        <span class="palette-label">${pal.name}</span>
      `;
      btn.addEventListener('click', () => {
        state.paletteId = pal.id;
        state.colors = [...pal.colors];
        syncUI();
        scheduleRender();
      });
      el.paletteGrid.appendChild(btn);
    }
  }

  // -------------------------------------------------------------------------
  // UI Sync & Live Viewport Sizing
  // -------------------------------------------------------------------------
  function syncUI() {
    // Pattern buttons
    el.patternGrid.querySelectorAll('.pattern-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.mode) === state.mode);
    });

    // Palette chips
    el.paletteGrid.querySelectorAll('.palette-chip').forEach((chip) => {
      chip.classList.toggle('active', chip.dataset.palette === state.paletteId);
    });

    // 4 custom color pickers
    for (let i = 0; i < 4; i++) {
      const hex = state.colors[i].toUpperCase();
      el[`colorPicker${i}`].value = hex.toLowerCase();
      el[`colorHex${i}`].textContent = hex;
    }

    // Sliders & readouts
    el.sliderComplexity.value = state.complexity;
    el.valComplexity.textContent = Number(state.complexity).toFixed(1);

    el.sliderScale.value = state.scale;
    el.valScale.textContent = Number(state.scale).toFixed(2);

    el.sliderWarp.value = state.warp;
    el.valWarp.textContent = Number(state.warp).toFixed(2);

    el.sliderSoftness.value = state.softness;
    el.valSoftness.textContent = Number(state.softness).toFixed(2);

    el.sliderContrast.value = state.contrast;
    el.valContrast.textContent = Number(state.contrast).toFixed(2);

    el.sliderRotation.value = state.rotation;
    el.valRotation.textContent = `${Math.round(state.rotation)}°`;

    el.sliderDither.value = state.dither;
    el.valDither.textContent = state.dither <= 0.001 ? 'OFF' : `${Number(state.dither).toFixed(2)}×`;

    el.inputSeed.value = state.seed;

    // Aspect & Resolution pills
    el.aspectGroup.querySelectorAll('.pill-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.aspect === state.aspect);
    });
    el.customDimRow.classList.toggle('hidden', state.aspect !== 'custom');
    el.inputCustomW.value = state.customW;
    el.inputCustomH.value = state.customH;

    el.resGroup.querySelectorAll('.pill-btn').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.res) === state.resolution);
      btn.disabled = state.aspect === 'custom';
      btn.style.opacity = state.aspect === 'custom' ? '0.45' : '1';
    });

    // JPEG Quality
    el.sliderJpgQuality.value = state.jpgQuality;
    el.valJpgQuality.textContent = `${Math.round(state.jpgQuality * 100)}%`;

    // Spec readouts
    const { width, height } = getOutputDimensions();
    const mp = ((width * height) / 1e6).toFixed(1);
    const tileGrid = renderer ? renderer.getTileGrid(width, height) : { total: 40, tileSize: 1024 };
    const resTag = getResolutionTag(width, height).toUpperCase();
    const modeObj = PATTERN_MODES.find(m => m.id === state.mode) || PATTERN_MODES[0];

    el.specDims.textContent = `${width} × ${height}`;
    el.specMeta.textContent = `${mp} MP · ${tileGrid.total} tiles`;
    el.singleResTag.textContent = resTag;
    el.batchBtnCount.textContent = String(state.batchCount);
    el.batchBtnRes.textContent = resTag;

    el.topDims.textContent = `${width} × ${height} px`;
    el.topMp.textContent = `${mp} MP (${resTag})`;
    el.topMode.textContent = modeObj.name;
    el.topSeed.textContent = `Seed ${state.seed}`;

    el.btnToggleDither.textContent = state.dither > 0.001 ? 'Anti-Banding: ON' : 'Anti-Banding: OFF';
    el.btnToggleDither.classList.toggle('active', state.dither > 0.001);
    el.ditherBadge.textContent = state.dither > 0.001
      ? `Triangular-PDF Dither (${Number(state.dither).toFixed(2)}×) · Tiled ${tileGrid.tileSize}px WebGL2`
      : `Dithering OFF · Tiled ${tileGrid.tileSize}px WebGL2`;

    if (seedRegistry) {
      el.seedHistoryCount.textContent = `${seedRegistry.count()} unique seeds logged`;
    }

    updatePreviewFrameSize();
  }

  function updatePreviewFrameSize() {
    if (!el.viewport || !el.canvasFrame) return;
    const { width: outW, height: outH } = getOutputDimensions();
    const aspect = outW / outH;

    const pad = 56;
    const availW = Math.max(200, el.viewport.clientWidth - pad);
    const availH = Math.max(180, el.viewport.clientHeight - pad);

    let cssW, cssH;
    if (availW / availH > aspect) {
      cssH = availH;
      cssW = availH * aspect;
    } else {
      cssW = availW;
      cssH = availW / aspect;
    }

    el.canvasFrame.style.width = `${Math.round(cssW)}px`;
    el.canvasFrame.style.height = `${Math.round(cssH)}px`;
  }

  function scheduleRender() {
    if (rafScheduled || !renderer) return;
    rafScheduled = true;
    requestAnimationFrame(() => {
      rafScheduled = false;
      renderLivePreview();
    });
  }

  function renderLivePreview() {
    if (!renderer) return;
    const { width: outW, height: outH } = getOutputDimensions();
    const aspect = outW / outH;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = el.canvasFrame.clientWidth || 800;
    const cssH = el.canvasFrame.clientHeight || 450;

    // Cap live preview resolution to 1440px longest side for silky 60fps interactivity
    let targetW = Math.round(cssW * dpr);
    let targetH = Math.round(cssH * dpr);
    const maxPreview = 1440;
    if (Math.max(targetW, targetH) > maxPreview) {
      if (aspect >= 1) {
        targetW = maxPreview;
        targetH = Math.round(maxPreview / aspect);
      } else {
        targetH = maxPreview;
        targetW = Math.round(maxPreview * aspect);
      }
    }

    renderer.renderPreview(state, targetW, targetH);
  }

  // -------------------------------------------------------------------------
  // Export Progress Modal Helpers
  // -------------------------------------------------------------------------
  function openProgress(title, sub) {
    isRendering = true;
    activeCancelToken = { cancelled: false };
    el.progressTitle.textContent = title;
    el.progressPct.textContent = '0%';
    el.progressFill.style.width = '0%';
    el.progressStatus.textContent = 'Preparing WebGL2 tiled offscreen pipeline...';
    el.progressSub.textContent = sub || `Tile size: ${renderer.tileSize}×${renderer.tileSize}px (anti-crash safe mode)`;
    el.progressOverlay.classList.remove('hidden');
    el.btnExportSingle.disabled = true;
    el.btnGenerateBatch.disabled = true;
  }

  function updateProgress(fraction, statusText) {
    const pct = Math.min(100, Math.max(0, Math.round(fraction * 100)));
    el.progressPct.textContent = `${pct}%`;
    el.progressFill.style.width = `${pct}%`;
    if (statusText) {
      el.progressStatus.textContent = statusText;
    }
  }

  function closeProgress() {
    isRendering = false;
    activeCancelToken = null;
    el.progressOverlay.classList.add('hidden');
    el.btnExportSingle.disabled = false;
    el.btnGenerateBatch.disabled = false;
  }

  // -------------------------------------------------------------------------
  // Single High-Res Export & Batch Export Handlers
  // -------------------------------------------------------------------------
  async function handleSingleExport() {
    if (isRendering || !renderer) return;
    const { width, height } = getOutputDimensions();
    const resTag = getResolutionTag(width, height).toUpperCase();
    const filename = buildFilename(state.mode, width, height, state.seed);

    openProgress(
      `Exporting ${resTag} Master JPG`,
      `${width} × ${height} px · JPEG ${Math.round(state.jpgQuality * 100)}% · Tiled ${renderer.tileSize}px`
    );

    try {
      const result = await renderer.renderHighResJpeg(state, {
        width,
        height,
        quality: state.jpgQuality,
        cancelToken: activeCancelToken,
        onTileProgress: (done, total) => {
          updateProgress(done / total, `Rendering ${resTag} — Tile ${done}/${total}...`);
        }
      });

      seedRegistry.register(state.seed);
      syncUI();
      triggerDownload(result.blob, filename);
      showToast(`Exported ${filename} (${formatBytes(result.blob.size)})`);
    } catch (err) {
      if (err && err.message === 'EXPORT_CANCELLED') {
        showToast('Export cancelled.');
      } else {
        console.error(err);
        showToast(`Export failed: ${err.message}`, true);
      }
    } finally {
      closeProgress();
    }
  }

  async function handleBatchExport() {
    if (isRendering || !renderer) return;

    const count = Math.max(1, Math.min(50, Math.round(Number(el.inputBatchCount.value) || 10)));
    state.batchCount = count;
    el.inputBatchCount.value = count;
    syncUI();

    const { width, height } = getOutputDimensions();
    const resTag = getResolutionTag(width, height).toUpperCase();
    const delivery = el.selectDelivery.value;
    const paletteStrategy = el.selectPaletteStrategy.value;
    const patternStrategy = el.selectPatternStrategy.value;
    const includeCsv = el.chkIncludeCsv.checked;

    const currentPal = PALETTES.find(p => p.id === state.paletteId);
    const currentPaletteName = currentPal ? currentPal.name : 'Custom Harmonious';
    const currentPaletteKeywords = currentPal ? currentPal.keywords : 'harmonious colors, pastel gradient';

    el.batchThumbs.innerHTML = '';
    el.batchStrip.classList.remove('hidden');
    el.batchStripSummary.textContent = `Generating batch: 0 / ${count} (${resTag})...`;

    openProgress(
      `Batch Production (${count} × ${resTag})`,
      `Unique seed, rotation, scale & color shifts per asset · ${delivery === 'zip' ? 'Auto ZIP Archive' : 'Individual Downloads'}`
    );

    try {
      const output = await batchProducer.runBatch(
        state,
        {
          count,
          width,
          height,
          quality: state.jpgQuality,
          delivery,
          paletteStrategy,
          patternStrategy,
          includeCsv,
          currentPaletteName,
          currentPaletteKeywords,
          cancelToken: activeCancelToken
        },
        {
          onItemStart: ({ state: itemState }) => {
            // Update live preview so user can watch each unique artwork being produced!
            renderer.renderPreview(itemState, el.previewCanvas.width, el.previewCanvas.height);
          },
          onProgress: ({ overall, label }) => {
            updateProgress(overall, label);
          },
          onItemComplete: (item, doneCount, totalCount) => {
            el.batchStripSummary.textContent = `Batch output: ${doneCount} / ${totalCount} unique ${resTag} JPGs`;
            if (item.thumbnailUrl) {
              const card = document.createElement('div');
              card.className = 'batch-thumb-card';
              card.title = `${item.filename} (${formatBytes(item.sizeBytes)})`;
              card.innerHTML = `
                <img src="${item.thumbnailUrl}" alt="${item.filename}" />
                <div class="batch-thumb-meta">
                  <span>#${item.seed}</span>
                  <span>${formatBytes(item.sizeBytes)}</span>
                </div>
              `;
              el.batchThumbs.appendChild(card);
              el.batchThumbs.scrollLeft = el.batchThumbs.scrollWidth;
            }
            el.seedHistoryCount.textContent = `${seedRegistry.count()} unique seeds logged`;
          }
        }
      );

      // Restore live preview to active workspace state
      renderLivePreview();
      syncUI();

      if (delivery === 'zip' && output.zipBlob) {
        showToast(`Batch complete! Downloaded ${output.zipFilename} (${formatBytes(output.zipBlob.size)})`);
      } else {
        showToast(`Batch complete! Generated ${output.items.length} unique ${resTag} JPGs.`);
      }
    } catch (err) {
      renderLivePreview();
      if (err && err.message === 'EXPORT_CANCELLED') {
        showToast('Batch production cancelled.');
      } else {
        console.error(err);
        showToast(`Batch error: ${err.message}`, true);
      }
    } finally {
      closeProgress();
    }
  }

  // -------------------------------------------------------------------------
  // Event Wiring
  // -------------------------------------------------------------------------
  function bindEvents() {
    // Pattern optimal defaults
    el.btnApplyModeDefaults.addEventListener('click', () => {
      const modeObj = PATTERN_MODES.find(m => m.id === state.mode);
      if (!modeObj) return;
      Object.assign(state, modeObj.defaults);
      syncUI();
      scheduleRender();
      showToast(`Loaded optimal parameters for ${modeObj.name}`);
    });

    // Harmonious Palette Randomizer
    el.btnHarmoniousPalette.addEventListener('click', () => {
      state.paletteId = 'custom';
      state.colors = generateHarmoniousPalette();
      syncUI();
      scheduleRender();
    });

    // 4 Custom Color Pickers
    for (let i = 0; i < 4; i++) {
      el[`colorPicker${i}`].addEventListener('input', (e) => {
        state.paletteId = 'custom';
        state.colors[i] = e.target.value.toUpperCase();
        syncUI();
        scheduleRender();
      });
    }

    // Sliders
    const sliderBindings = [
      ['sliderComplexity', 'complexity'],
      ['sliderScale', 'scale'],
      ['sliderWarp', 'warp'],
      ['sliderSoftness', 'softness'],
      ['sliderContrast', 'contrast'],
      ['sliderRotation', 'rotation'],
      ['sliderDither', 'dither'],
      ['sliderJpgQuality', 'jpgQuality']
    ];

    for (const [elKey, stateKey] of sliderBindings) {
      el[elKey].addEventListener('input', (e) => {
        state[stateKey] = parseFloat(e.target.value);
        syncUI();
        if (stateKey !== 'jpgQuality') {
          scheduleRender();
        }
      });
    }

    // Seed controls
    const pickNewSeed = () => {
      state.seed = seedRegistry.nextUniqueSeed();
      syncUI();
      scheduleRender();
    };
    el.btnRandomSeed.addEventListener('click', pickNewSeed);
    el.btnRandomSeedInline.addEventListener('click', pickNewSeed);
    el.inputSeed.addEventListener('change', (e) => {
      const val = Math.max(1, Math.min(9999999, Math.round(Number(e.target.value) || 1)));
      state.seed = val;
      syncUI();
      scheduleRender();
    });

    // Aspect ratio buttons
    el.aspectGroup.querySelectorAll('.pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.aspect = btn.dataset.aspect;
        syncUI();
        scheduleRender();
      });
    });

    // Custom dimensions
    const updateCustomDims = () => {
      state.customW = Math.max(256, Math.min(12000, Math.round(Number(el.inputCustomW.value) || 3840)));
      state.customH = Math.max(256, Math.min(12000, Math.round(Number(el.inputCustomH.value) || 2160)));
      syncUI();
      scheduleRender();
    };
    el.inputCustomW.addEventListener('change', updateCustomDims);
    el.inputCustomH.addEventListener('change', updateCustomDims);

    // Resolution buttons (4K / 6K / 8K)
    el.resGroup.querySelectorAll('.pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (state.aspect === 'custom') return;
        state.resolution = Number(btn.dataset.res);
        syncUI();
        scheduleRender();
      });
    });

    // Batch count
    el.inputBatchCount.addEventListener('input', (e) => {
      const val = Math.max(1, Math.min(50, Math.round(Number(e.target.value) || 1)));
      state.batchCount = val;
      el.batchBtnCount.textContent = String(val);
    });

    // Export actions
    el.btnExportSingle.addEventListener('click', handleSingleExport);
    el.btnGenerateBatch.addEventListener('click', handleBatchExport);
    el.btnCancelRender.addEventListener('click', () => {
      if (activeCancelToken) {
        activeCancelToken.cancelled = true;
      }
    });

    // Clear seed history
    el.btnClearSeedHistory.addEventListener('click', () => {
      seedRegistry.clear();
      syncUI();
      showToast('Unique seed history cleared.');
    });

    el.btnClearBatchStrip.addEventListener('click', () => {
      el.batchStrip.classList.add('hidden');
      el.batchThumbs.innerHTML = '';
    });

    // Topbar actions
    el.btnRandomizeAll.addEventListener('click', () => {
      state.seed = seedRegistry.nextUniqueSeed();
      state.rotation = Math.floor(Math.random() * 360);
      state.scale = Number((0.85 + Math.random() * 1.45).toFixed(2));
      state.warp = Number((0.75 + Math.random() * 1.45).toFixed(2));
      state.paletteId = 'custom';
      state.colors = generateHarmoniousPalette();
      syncUI();
      scheduleRender();
    });

    el.btnToggleDither.addEventListener('click', () => {
      state.dither = state.dither > 0.001 ? 0.0 : 1.0;
      syncUI();
      scheduleRender();
    });

    el.btnResetDefaults.addEventListener('click', () => {
      state = { ...DEFAULT_STATE, colors: [...DEFAULT_STATE.colors] };
      syncUI();
      scheduleRender();
      showToast('Reset to Ethereal Silk · Pastel Dream defaults');
    });

    // Resize handling
    window.addEventListener('resize', () => {
      updatePreviewFrameSize();
      scheduleRender();
    });

    // Convenient studio keyboard shortcuts (when not typing in inputs)
    window.addEventListener('keydown', (e) => {
      if (isRendering) return;
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'r' || e.key === 'R') {
        el.btnRandomizeAll.click();
      } else if (e.key === 's' || e.key === 'S') {
        pickNewSeed();
      }
    });
  }

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------
  function init() {
    cacheDom();
    seedRegistry = new SeedRegistry();
    buildPatternButtons();
    buildPaletteChips();

    try {
      renderer = new StockFlowRenderer(el.previewCanvas);
      batchProducer = new BatchProducer(renderer, seedRegistry);
      el.gpuStatusText.textContent = `WebGL2 · ${renderer.tileSize}px`;
      el.gpuBadge.title = `GPU: ${renderer.gpuInfo.renderer} (MAX_TEXTURE_SIZE: ${renderer.gpuInfo.maxTextureSize})`;
    } catch (err) {
      console.error('WebGL2 Initialization Error:', err);
      el.gpuDot.style.background = '#de6363';
      el.gpuStatusText.textContent = 'WebGL2 Error';
      showToast(err.message, true);
      return;
    }

    bindEvents();
    syncUI();
    renderLivePreview();

    // Expose clean API for diagnostics / automated testing
    global.StockFlowApp = {
      getState: () => ({ ...state, colors: [...state.colors] }),
      setState: (partial) => {
        Object.assign(state, partial);
        syncUI();
        renderLivePreview();
      },
      getRenderer: () => renderer,
      getBatchProducer: () => batchProducer,
      getSeedRegistry: () => seedRegistry,
      getOutputDimensions
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
