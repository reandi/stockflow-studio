/**
 * StockFlow Studio — WebGL2 Live & Tiled 4K–8K Offscreen Renderer
 * Renders real-time interactive previews and stitches high-resolution
 * 4K / 6K / 8K images tile-by-tile (default 1024×1024) onto a 2D canvas
 * to avoid GPU MAX_TEXTURE_SIZE limits and prevent browser crashes.
 */
(function (global) {
  'use strict';

  const { VERTEX_SHADER, FRAGMENT_SHADER } = global.StockFlowShaders;
  const { hexToRgbNorm } = global.StockFlowPalettes;

  const UNIFORM_NAMES = [
    'u_fullResolution',
    'u_tileOffset',
    'u_mode',
    'u_seed',
    'u_complexity',
    'u_scale',
    'u_warp',
    'u_softness',
    'u_contrast',
    'u_rotation',
    'u_dither',
    'u_color0',
    'u_color1',
    'u_color2',
    'u_color3'
  ];

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) || 'Unknown shader compile error';
      gl.deleteShader(shader);
      throw new Error(`Shader compilation failed: ${log}`);
    }
    return shader;
  }

  function createProgramBundle(gl) {
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(program) || 'Unknown link error';
      gl.deleteProgram(program);
      throw new Error(`Program linking failed: ${log}`);
    }

    const uniforms = {};
    for (const name of UNIFORM_NAMES) {
      uniforms[name] = gl.getUniformLocation(program, name);
    }

    const vao = gl.createVertexArray();
    return { program, uniforms, vao };
  }

  function applyUniforms(gl, bundle, state, fullWidth, fullHeight, tileOffsetX, tileOffsetY) {
    const u = bundle.uniforms;
    gl.useProgram(bundle.program);

    gl.uniform2f(u.u_fullResolution, fullWidth, fullHeight);
    gl.uniform2f(u.u_tileOffset, tileOffsetX, tileOffsetY);

    gl.uniform1i(u.u_mode, state.mode | 0);
    gl.uniform1f(u.u_seed, Number(state.seed) || 1);
    gl.uniform1f(u.u_complexity, Number(state.complexity));
    gl.uniform1f(u.u_scale, Number(state.scale));
    gl.uniform1f(u.u_warp, Number(state.warp));
    gl.uniform1f(u.u_softness, Number(state.softness));
    gl.uniform1f(u.u_contrast, Number(state.contrast));
    gl.uniform1f(u.u_rotation, (Number(state.rotation) || 0) * Math.PI / 180);
    gl.uniform1f(u.u_dither, Number(state.dither));

    const c0 = hexToRgbNorm(state.colors[0]);
    const c1 = hexToRgbNorm(state.colors[1]);
    const c2 = hexToRgbNorm(state.colors[2]);
    const c3 = hexToRgbNorm(state.colors[3]);

    gl.uniform3f(u.u_color0, c0[0], c0[1], c0[2]);
    gl.uniform3f(u.u_color1, c1[0], c1[1], c1[2]);
    gl.uniform3f(u.u_color2, c2[0], c2[1], c2[2]);
    gl.uniform3f(u.u_color3, c3[0], c3[1], c3[2]);
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  class StockFlowRenderer {
    constructor(previewCanvas) {
      this.previewCanvas = previewCanvas;
      this.gl = null;
      this.previewBundle = null;

      this.tileCanvas = null;
      this.tileGl = null;
      this.tileBundle = null;
      this.tileSize = 1024;
      this.gpuInfo = { renderer: 'WebGL2', maxTextureSize: 4096 };

      this._initPreviewContext();
    }

    _initPreviewContext() {
      const gl = this.previewCanvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance'
      });

      if (!gl) {
        throw new Error('WebGL2 is not supported by this browser or hardware.');
      }

      this.gl = gl;
      this.previewBundle = createProgramBundle(gl);

      const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
      const dbgExt = gl.getExtension('WEBGL_debug_renderer_info');
      const rendererStr = dbgExt
        ? gl.getParameter(dbgExt.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);

      this.gpuInfo = {
        renderer: rendererStr || 'WebGL2 GPU',
        maxTextureSize: maxTex
      };

      // Safe offscreen tile size: 1024×1024 (or smaller on low-end GPUs)
      this.tileSize = Math.min(1024, Math.max(512, Math.floor(maxTex / 4)));
    }

    _ensureTileContext() {
      if (this.tileGl && !this.tileGl.isContextLost()) {
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = this.tileSize;
      canvas.height = this.tileSize;

      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance'
      });

      if (!gl) {
        throw new Error('Could not initialize offscreen WebGL2 context for tiled export.');
      }

      this.tileCanvas = canvas;
      this.tileGl = gl;
      this.tileBundle = createProgramBundle(gl);
    }

    /**
     * Renders the live interactive preview canvas at crisp display resolution
     * matching the exact selected aspect ratio.
     */
    renderPreview(state, targetWidth, targetHeight) {
      const gl = this.gl;
      if (!gl || gl.isContextLost()) return;

      const w = Math.max(64, Math.round(targetWidth));
      const h = Math.max(64, Math.round(targetHeight));

      if (this.previewCanvas.width !== w || this.previewCanvas.height !== h) {
        this.previewCanvas.width = w;
        this.previewCanvas.height = h;
      }

      gl.viewport(0, 0, w, h);
      applyUniforms(gl, this.previewBundle, state, w, h, 0, 0);
      gl.bindVertexArray(this.previewBundle.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.bindVertexArray(null);
    }

    /**
     * Computes exact integer output pixel dimensions for a given resolution preset
     * (4K / 6K / 8K) and aspect ratio or custom pixel dimensions.
     */
    static computeDimensions(aspectPreset, resolutionLongSide, customW, customH) {
      if (aspectPreset === 'custom') {
        const w = Math.max(256, Math.min(12000, Math.round(Number(customW) || 3840)));
        const h = Math.max(256, Math.min(12000, Math.round(Number(customH) || 2160)));
        return { width: w, height: h };
      }

      const ratios = {
        '16:9': [16, 9],
        '9:16': [9, 16],
        '3:2': [3, 2],
        '4:3': [4, 3],
        '1:1': [1, 1]
      };

      const [rw, rh] = ratios[aspectPreset] || [16, 9];
      const longSide = Math.max(512, Math.round(Number(resolutionLongSide) || 3840));

      let width, height;
      if (rw >= rh) {
        width = longSide;
        height = Math.round(longSide * (rh / rw));
      } else {
        height = longSide;
        width = Math.round(longSide * (rw / rh));
      }
      // Keep dimensions even for clean JPEG 4:2:0/4:4:4 MCU alignment
      width = Math.round(width / 2) * 2;
      height = Math.round(height / 2) * 2;
      return { width, height };
    }

    getTileGrid(width, height) {
      const cols = Math.ceil(width / this.tileSize);
      const rows = Math.ceil(height / this.tileSize);
      return { cols, rows, total: cols * rows, tileSize: this.tileSize };
    }

    /**
     * Tiled Offscreen High-Resolution Render (4K / 6K / 8K) -> JPEG Blob + Thumbnail.
     * Supports progress callbacks and cooperative cancellation via AbortSignal-like token.
     */
    async renderHighResJpeg(state, options) {
      const {
        width,
        height,
        quality = 0.97,
        onTileProgress = null,
        cancelToken = null,
        createThumbnail = false
      } = options;

      this._ensureTileContext();

      const gl = this.tileGl;
      const bundle = this.tileBundle;
      const tileSize = this.tileSize;

      const outCanvas = document.createElement('canvas');
      outCanvas.width = width;
      outCanvas.height = height;
      const ctx = outCanvas.getContext('2d', { alpha: false });
      if (!ctx) {
        throw new Error(`Unable to allocate ${width}×${height} 2D export canvas.`);
      }

      const cols = Math.ceil(width / tileSize);
      const rows = Math.ceil(height / tileSize);
      const totalTiles = cols * rows;
      let doneTiles = 0;

      gl.bindVertexArray(bundle.vao);

      for (let row = 0; row < rows; row++) {
        const y = row * tileSize;
        const th = Math.min(tileSize, height - y);
        // Convert 2D top-down tile Y to exact WebGL bottom-up origin Y
        const glOffsetY = height - (y + th);

        for (let col = 0; col < cols; col++) {
          if (cancelToken && cancelToken.cancelled) {
            gl.bindVertexArray(null);
            outCanvas.width = 1;
            outCanvas.height = 1;
            throw new Error('EXPORT_CANCELLED');
          }

          const x = col * tileSize;
          const tw = Math.min(tileSize, width - x);
          const glOffsetX = x;

          gl.viewport(0, 0, tw, th);
          applyUniforms(gl, bundle, state, width, height, glOffsetX, glOffsetY);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.flush();

          // Copy bottom-left (0 .. tw, 0 .. th) of WebGL canvas into 2D canvas at (x, y)
          const srcY = tileSize - th;
          ctx.drawImage(this.tileCanvas, 0, srcY, tw, th, x, y, tw, th);

          doneTiles++;
          if (onTileProgress) {
            onTileProgress(doneTiles, totalTiles);
          }

          // Yield periodically so browser remains responsive & avoids GPU watchdog timeout
          if (doneTiles % 4 === 0 || doneTiles === totalTiles) {
            await nextFrame();
          }
        }
      }

      gl.bindVertexArray(null);

      let thumbnailUrl = null;
      if (createThumbnail) {
        const thumbMax = 240;
        const scale = thumbMax / Math.max(width, height);
        const tw = Math.max(32, Math.round(width * scale));
        const th = Math.max(32, Math.round(height * scale));
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = tw;
        thumbCanvas.height = th;
        const tctx = thumbCanvas.getContext('2d', { alpha: false });
        tctx.imageSmoothingEnabled = true;
        tctx.imageSmoothingQuality = 'high';
        tctx.drawImage(outCanvas, 0, 0, tw, th);
        thumbnailUrl = thumbCanvas.toDataURL('image/jpeg', 0.82);
        thumbCanvas.width = 1;
        thumbCanvas.height = 1;
      }

      const blob = await new Promise((resolve, reject) => {
        outCanvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Canvas toBlob JPEG encoding failed.'))),
          'image/jpeg',
          quality
        );
      });

      // Release full-resolution backing buffer immediately for multi-image 8K batches
      outCanvas.width = 1;
      outCanvas.height = 1;

      return { blob, thumbnailUrl, width, height, tiles: totalTiles };
    }
  }

  global.StockFlowRenderer = StockFlowRenderer;
})(window);
