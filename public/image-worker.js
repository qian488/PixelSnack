function srgb(value) { const v = value / 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }
function oklab(rgb) {
  const r = srgb(rgb[0]), g = srgb(rgb[1]), b = srgb(rgb[2]);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s];
}
function nearest(lab, palette) {
  let best = palette[0], distance = Infinity;
  for (const candidate of palette) { const delta = (lab[0] - candidate.lab[0]) ** 2 + (lab[1] - candidate.lab[1]) ** 2 + (lab[2] - candidate.lab[2]) ** 2; if (delta < distance) { distance = delta; best = candidate; } }
  return best;
}
self.onmessage = (event) => {
  try {
    const { pixels, width, height, palette: sourcePalette, dither, maxColors } = event.data;
    if (maxColors < 1) throw new Error("当前色板没有可用颜色");
    const allPalette = sourcePalette.map((entry) => ({ ...entry, lab: oklab(entry.rgb) }));
    if (!allPalette.length) throw new Error("当前色板没有可用颜色");
    const usage = new Map();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) { const p = (y * width + x) * 4; if (pixels[p + 3] < 32) continue; const best = nearest(oklab([pixels[p], pixels[p + 1], pixels[p + 2]]), allPalette); usage.set(best.index, (usage.get(best.index) || 0) + 1); }
      if (y % 8 === 0) self.postMessage({ type: "progress", value: Math.round(y / height * 35) });
    }
    const palette = allPalette.filter((entry) => usage.has(entry.index)).sort((a, b) => (usage.get(b.index) || 0) - (usage.get(a.index) || 0)).slice(0, Math.max(1, maxColors));
    const cells = new Uint16Array(width * height);
    if (!palette.length) { self.postMessage({ type: "result", cells: cells.buffer }, [cells.buffer]); return; }
    const work = new Float32Array(pixels.length); pixels.forEach((value, index) => { work[index] = value; });
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x, p = i * 4; if (work[p + 3] < 32) continue;
        const source = [work[p], work[p + 1], work[p + 2]], best = nearest(oklab(source), palette); cells[i] = best.index;
        if (dither) {
          const error = source.map((value, channel) => value - best.rgb[channel]);
          const spread = (nx, ny, factor) => { if (nx < 0 || nx >= width || ny >= height) return; const q = (ny * width + nx) * 4; for (let channel = 0; channel < 3; channel++) work[q + channel] = Math.max(0, Math.min(255, work[q + channel] + error[channel] * factor)); };
          spread(x + 1, y, 7 / 16); spread(x - 1, y + 1, 3 / 16); spread(x, y + 1, 5 / 16); spread(x + 1, y + 1, 1 / 16);
        }
      }
      if (y % 8 === 0) self.postMessage({ type: "progress", value: 35 + Math.round(y / height * 65) });
    }
    self.postMessage({ type: "result", cells: cells.buffer }, [cells.buffer]);
  } catch (error) { self.postMessage({ type: "error", message: error instanceof Error ? error.message : "图片转换失败" }); }
};
