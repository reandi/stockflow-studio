/**
 * StockFlow Studio — Commercial Microstock Color Palettes & Harmony Engine
 * Curated palettes optimized for Shutterstock / Adobe Stock abstract backgrounds,
 * plus a procedural color-theory harmonious palette generator.
 */
(function (global) {
  'use strict';

  const PALETTES = [
    {
      id: 'pastel-dream',
      name: 'Pastel Dream',
      keywords: 'pastel, soft, dreamy, blush pink, sky blue, peach, cream',
      colors: ['#FBF4EC', '#FAD2BE', '#F3B8CC', '#B2D9F7']
    },
    {
      id: 'luxury-gold-ivory',
      name: 'Luxury Gold & Ivory',
      keywords: 'luxury, gold, ivory, champagne, silk, elegant, wedding',
      colors: ['#FAF6EE', '#EFE2C6', '#D4AF7A', '#9E7B4F']
    },
    {
      id: 'deep-ocean-teal',
      name: 'Deep Ocean Teal',
      keywords: 'ocean, teal, turquoise, aqua, deep blue, marine, tranquil',
      colors: ['#071E2B', '#0E4D64', '#268C9E', '#A8E3E8']
    },
    {
      id: 'warm-sunset',
      name: 'Warm Sunset',
      keywords: 'sunset, warm, peach, coral, amber, golden hour, orange',
      colors: ['#FFF1E0', '#FBC29D', '#EE8872', '#B54B62']
    },
    {
      id: 'minimalist-mono',
      name: 'Minimalist Monochrome',
      keywords: 'minimalist, white, silver, gray, monochrome, clean, modern',
      colors: ['#F7F7F5', '#DFDFE2', '#A6ABB4', '#4B505A']
    },
    {
      id: 'neon-cyber',
      name: 'Neon Cyber',
      keywords: 'neon, cyber, futuristic, cyan, magenta, glowing, tech',
      colors: ['#0A1024', '#163A6B', '#00D4E8', '#FF4FA3']
    },
    {
      id: 'botanical-sage',
      name: 'Botanical Sage',
      keywords: 'sage green, botanical, organic, eucalyptus, linen, calm, spa',
      colors: ['#F5F6F0', '#D7E2D0', '#96B29B', '#4D6B5D']
    },
    {
      id: 'rose-quartz',
      name: 'Rose Quartz',
      keywords: 'rose quartz, blush, feminine, pearl, soft pink, beauty, cosmetics',
      colors: ['#FDF6F5', '#F3D4D7', '#DFA3B2', '#9F6B7E']
    },
    {
      id: 'nordic-ice',
      name: 'Nordic Ice',
      keywords: 'ice blue, frost, winter, minimalist, glacier, crisp, airy',
      colors: ['#F4F9FC', '#D6E8F5', '#92BDE0', '#4A79A8']
    },
    {
      id: 'obsidian-copper',
      name: 'Obsidian Copper',
      keywords: 'dark luxury, obsidian, copper, bronze, metallic, dramatic',
      colors: ['#101216', '#2C2320', '#A36243', '#E8B892']
    }
  ];

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
  }

  function hexToRgbNorm(hex) {
    const clean = hex.replace('#', '').trim();
    const full = clean.length === 3
      ? clean.split('').map(c => c + c).join('')
      : clean.padEnd(6, '0').slice(0, 6);
    const num = parseInt(full, 16);
    return [
      ((num >> 16) & 255) / 255,
      ((num >> 8) & 255) / 255,
      (num & 255) / 255
    ];
  }

  function rgbToHex(r, g, b) {
    const toHex = (v) => clamp(Math.round(v * 255), 0, 255).toString(16).padStart(2, '0');
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }

  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 100) / 100;
    l = clamp(l, 0, 100) / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return rgbToHex(r + m, g + m, b + m).toUpperCase();
  }

  function hexToHsl(hex) {
    const [r, g, b] = hexToRgbNorm(hex);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [h * 360, s * 100, l * 100];
  }

  /**
   * Seeded deterministic PRNG (Mulberry32) so batch variations are reproducible
   * and strictly controlled.
   */
  function createRng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Generates a commercially appealing harmonious 4-color palette using
   * curated microstock color-harmony archetypes (Airy Pastel, Warm Analogous,
   * Deep Luminous, Soft Split-Complementary, or Monochrome Silk).
   */
  function generateHarmoniousPalette(seed) {
    const rand = seed !== undefined ? createRng(seed) : Math.random;
    const baseHue = rand() * 360;
    const mode = Math.floor(rand() * 5);

    if (mode === 0) {
      // Airy Pastel Dream (highest commercial demand on microstock)
      const h1 = baseHue;
      const h2 = (baseHue + 28 + rand() * 25) % 360;
      const h3 = (baseHue + 160 + rand() * 55) % 360;
      return [
        hslToHex(h1, 22 + rand() * 18, 94 + rand() * 4),
        hslToHex(h1, 45 + rand() * 25, 82 + rand() * 8),
        hslToHex(h2, 42 + rand() * 28, 76 + rand() * 9),
        hslToHex(h3, 46 + rand() * 26, 78 + rand() * 10)
      ];
    } else if (mode === 1) {
      // Analogous Silk Glow
      const step = (rand() > 0.5 ? 1 : -1) * (20 + rand() * 24);
      const isDark = rand() > 0.55;
      if (isDark) {
        return [
          hslToHex(baseHue, 32 + rand() * 20, 9 + rand() * 6),
          hslToHex(baseHue + step, 45 + rand() * 25, 24 + rand() * 10),
          hslToHex(baseHue + step * 2, 55 + rand() * 25, 48 + rand() * 12),
          hslToHex(baseHue + step * 2.6, 52 + rand() * 26, 78 + rand() * 12)
        ];
      }
      return [
        hslToHex(baseHue, 25 + rand() * 20, 94 + rand() * 4),
        hslToHex(baseHue + step, 42 + rand() * 25, 81 + rand() * 8),
        hslToHex(baseHue + step * 2, 52 + rand() * 22, 65 + rand() * 12),
        hslToHex(baseHue + step * 2.5, 48 + rand() * 22, 44 + rand() * 14)
      ];
    } else if (mode === 2) {
      // Split-Complementary Soft Editorial
      const h2 = (baseHue + 150 + rand() * 15) % 360;
      const h3 = (baseHue + 200 + rand() * 18) % 360;
      return [
        hslToHex(baseHue, 18 + rand() * 16, 95 + rand() * 3),
        hslToHex(baseHue, 40 + rand() * 24, 80 + rand() * 8),
        hslToHex(h2, 38 + rand() * 25, 72 + rand() * 10),
        hslToHex(h3, 45 + rand() * 25, 58 + rand() * 14)
      ];
    } else if (mode === 3) {
      // Luxury Moody Metallic / Jewel
      const accentHue = (baseHue + 35 + rand() * 45) % 360;
      return [
        hslToHex(baseHue, 26 + rand() * 18, 8 + rand() * 5),
        hslToHex(baseHue, 38 + rand() * 20, 20 + rand() * 8),
        hslToHex(accentHue, 48 + rand() * 25, 46 + rand() * 12),
        hslToHex(accentHue + 10, 58 + rand() * 22, 78 + rand() * 10)
      ];
    } else {
      // Warm/Cool Editorial Gradient
      const comp = (baseHue + 180 + (rand() - 0.5) * 40) % 360;
      return [
        hslToHex(baseHue, 30 + rand() * 22, 92 + rand() * 5),
        hslToHex(baseHue + 18, 52 + rand() * 22, 76 + rand() * 9),
        hslToHex(comp - 15, 44 + rand() * 24, 70 + rand() * 10),
        hslToHex(comp, 46 + rand() * 24, 52 + rand() * 14)
      ];
    }
  }

  /**
   * Produces a subtle, tasteful variation of an existing 4-color palette
   * for batch uniqueness while staying within the chosen aesthetic family.
   */
  function varyPalette(colors, seed, hueRange = 22) {
    const rand = createRng(seed);
    const globalHueShift = (rand() - 0.5) * 2 * hueRange;
    return colors.map((hex) => {
      const [h, s, l] = hexToHsl(hex);
      const localH = h + globalHueShift + (rand() - 0.5) * 10;
      const localS = clamp(s + (rand() - 0.5) * 10, 4, 96);
      const localL = clamp(l + (rand() - 0.5) * 6, 4, 97);
      return hslToHex(localH, localS, localL);
    });
  }

  global.StockFlowPalettes = {
    PALETTES,
    hexToRgbNorm,
    hexToHsl,
    hslToHex,
    generateHarmoniousPalette,
    varyPalette,
    createRng
  };
})(window);
