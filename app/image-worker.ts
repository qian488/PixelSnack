type PaletteEntry = { index: number; rgb: [number, number, number] };
type Input = { pixels: Uint8ClampedArray; width: number; height: number; palette: PaletteEntry[]; dither: boolean; maxColors: number };

function srgb(v: number) { v /= 255; return v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }
function oklab([r8, g8, b8]: [number, number, number]) {
  const r = srgb(r8), g = srgb(g8), b = srgb(b8);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s];
}

self.onmessage = (event: MessageEvent<Input>) => {
  const { pixels, width, height, dither, maxColors } = event.data;
  const palette = event.data.palette.slice(0, maxColors).map((p) => ({ ...p, lab: oklab(p.rgb) }));
  const work = new Float32Array(pixels.length); pixels.forEach((v, i) => { work[i] = v; });
  const cells = new Uint16Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, p = i * 4;
    if (work[p + 3] < 32) continue;
    const source: [number, number, number] = [work[p], work[p + 1], work[p + 2]]; const lab = oklab(source);
    let best = palette[0], distance = Infinity;
    for (const candidate of palette) { const d = (lab[0] - candidate.lab[0]) ** 2 + (lab[1] - candidate.lab[1]) ** 2 + (lab[2] - candidate.lab[2]) ** 2; if (d < distance) { distance = d; best = candidate; } }
    cells[i] = best.index;
    if (dither) {
      const error = source.map((v, c) => v - best.rgb[c]);
      const spread = (nx: number, ny: number, factor: number) => { if (nx < 0 || nx >= width || ny >= height) return; const q = (ny * width + nx) * 4; for (let c = 0; c < 3; c++) work[q + c] = Math.max(0, Math.min(255, work[q + c] + error[c] * factor)); };
      spread(x + 1, y, 7 / 16); spread(x - 1, y + 1, 3 / 16); spread(x, y + 1, 5 / 16); spread(x + 1, y + 1, 1 / 16);
    }
  }
  postMessage({ cells }, [cells.buffer]);
};
