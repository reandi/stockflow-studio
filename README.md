# StockFlow Studio

**StockFlow Studio** is a 100% client-side, zero-AI procedural WebGL2 GLSL studio for mass-producing banding-free **4K to 8K** abstract background images tailored for microstock platforms such as Shutterstock and Adobe Stock.

## Features

- **4 Procedural WebGL2 (`#version 300 es`) Pattern Modes:**
  - **Ethereal Silk / Flowing Chiffon:** Anisotropic multi-octave 2D Simplex FBM + layered domain warping + overlapping sheer chiffon pleats + world-space normal-map lighting.
  - **Liquid Marble / Fluid Waves:** Broad fluid advection waves, metallic/mineral veins, and glossy specular highlights.
  - **Aurora Mist / Soft Gradient:** Atmospheric sweeping light curtains with dreamy Gaussian diffusion.
  - **Frosted Ribbons / Abstract Glass:** Curved translucent glass sheets with optical refraction shifts and crisp caustic rims.
- **Anti-Banding Micro-Dithering:** Global-coordinate **Triangular-PDF Interleaved Gradient Noise** dithering prevents 8-bit JPEG gradient banding while remaining 100% seamless across tiled renders.
- **Commercial Color Palettes + Custom Picker:** 10 curated microstock palettes (*Pastel Dream*, *Luxury Gold & Ivory*, *Deep Ocean Teal*, *Warm Sunset*, *Minimalist Monochrome*, *Neon Cyber*, *Botanical Sage*, *Rose Quartz*, *Nordic Ice*, *Obsidian Copper*), 4 editable color wells, and a procedural color-theory **Randomize Harmonious** generator.
- **Anti-Crash 4K / 6K / 8K Tiled Offscreen Export:** Renders tile-by-tile (`1024×1024` offscreen WebGL2 tiles) and stitches onto a full-resolution 2D canvas to bypass GPU `MAX_TEXTURE_SIZE` limits and prevent browser crashes.
- **Batch Production Mode (1–50 Images):**
  - Guarantees unique `seed`, rotation, scale, warp, and color shifts per image.
  - Tracks all used seeds persistently in `localStorage` (`stockflow_studio_used_seeds_v1`) to prevent duplicates.
  - Automatically packages high-quality (`0.96–0.98`) JPEGs plus an optional `shutterstock-metadata.csv` into a `.zip` archive via JSZip (with a built-in pure-JS PKZIP fallback when offline).

## Running Locally

No build step, backend, or API keys required. Simply open `index.html` directly in any modern WebGL2-capable browser (Chrome, Edge, Firefox, Safari) or serve the folder with any static HTTP server:

```bash
python3 -m http.server 8080
```

## Project Structure

```text
stockflow-studio/
├── index.html          # Main studio interface & JSZip CDN loader
├── css/
│   └── styles.css      # Dark studio workstation styling
└── js/
    ├── palettes.js     # Curated commercial palettes & HSL harmony engine
    ├── shaders.js      # WebGL2 GLSL 300 es vertex & fragment shaders + micro-dithering
    ├── renderer.js     # Live WebGL2 preview & tiled 4K–8K offscreen renderer
    ├── batch.js        # Unique seed registry, batch producer, CSV & ZIP packager
    └── app.js          # Interactive UI controller & keyboard shortcuts
```
