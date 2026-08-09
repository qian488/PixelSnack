export type EditorTool = "pencil" | "eraser" | "fill" | "eyedropper" | "pan";

export type PaletteColor = {
  index: number;
  brand: string;
  code: string;
  name: string;
  rgb: [number, number, number];
  hex: string;
  finish?: string;
};

export type PixelProject = {
  schemaVersion: 1;
  id: string;
  name: string;
  width: number;
  height: number;
  cells: Uint16Array;
  palette: PaletteColor[];
  board: { width: number; height: number };
  createdAt: string;
  updatedAt: string;
};

export type CellChange = { index: number; before: number; after: number };

const swatches = [
  ["D001", "Ink", "#15171c"], ["D002", "Snow", "#f6f2e8"],
  ["D003", "Neon cyan", "#6ee7ef"], ["D004", "Aqua", "#2ab7b2"],
  ["D005", "Signal blue", "#3548aa"], ["D006", "Midnight", "#172c60"],
  ["D007", "Violet", "#6345a2"], ["D008", "Lilac", "#b49ad6"],
  ["D009", "Hot pink", "#f0689c"], ["D010", "Blush", "#f5b6b2"],
  ["D011", "Signal red", "#d9494d"], ["D012", "Tangerine", "#ef7c2b"],
  ["D013", "Amber", "#f6a90b"], ["D014", "Sun", "#ffd34f"],
  ["D015", "Cream", "#f5df9d"], ["D016", "Acid lime", "#c5dc64"],
  ["D017", "Moss", "#69772d"], ["D018", "Forest", "#294d42"],
  ["D019", "Mint", "#a8d8c9"], ["D020", "Sky", "#9fd1df"],
  ["D021", "Steel", "#8295aa"], ["D022", "Fog", "#b9bec7"],
  ["D023", "Cocoa", "#7c5948"], ["D024", "Sand", "#c5a782"],
] as const;

function hexRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

export const demoPalette: PaletteColor[] = swatches.map(([code, name, hex], i) => ({
  index: i + 1, brand: "PixelSnack Dev Set", code, name, hex, rgb: hexRgb(hex), finish: "solid",
}));

export function createProject(width = 48, height = 48, name = "NEON CAT 01"): PixelProject {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1, id: crypto.randomUUID(), name, width, height,
    cells: new Uint16Array(width * height), palette: demoPalette.map((c) => ({ ...c })),
    board: { width: 29, height: 29 }, createdAt: now, updatedAt: now,
  };
}

export function createDemoProject() {
  const p = createProject(48, 48, "NEON CAT 01");
  const put = (x: number, y: number, value: number) => { if (x >= 0 && y >= 0 && x < p.width && y < p.height) p.cells[y * p.width + x] = value; };
  for (let y = 7; y < 41; y++) for (let x = 7; x < 41; x++) {
    const dx = (x - 23.5) / 17, dy = (y - 25) / 16;
    if (dx * dx + dy * dy < 1) put(x, y, 15);
  }
  for (let y = 3; y < 19; y++) for (let x = 6; x < 18; x++) if (y >= 15 - Math.abs(x - 10)) put(x, y, 1);
  for (let y = 3; y < 19; y++) for (let x = 30; x < 42; x++) if (y >= 15 - Math.abs(x - 37)) put(x, y, 1);
  for (let y = 8; y < 20; y++) for (let x = 12; x < 36; x++) if (y < 18 - Math.abs(x - 24) / 3) put(x, y, x % 5 === 0 ? 5 : 1);
  for (const cx of [16, 31]) for (let y = 22; y < 29; y++) for (let x = cx - 5; x <= cx + 5; x++) {
    const d = Math.abs(x - cx) + Math.abs(y - 25); if (d < 7) put(x, y, d < 4 ? (y < 25 ? 20 : 3) : 1);
  }
  for (let x = 21; x < 27; x++) put(x, 31 + Math.abs(x - 24), 10);
  for (let x = 14; x < 20; x++) put(x, 34 + (x % 2), 9); for (let x = 29; x < 35; x++) put(x, 34 + (x % 2), 9);
  return p;
}

export function lineCells(x0: number, y0: number, x1: number, y1: number) {
  const result: [number, number][] = [];
  const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  while (true) {
    result.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return result;
}

export function floodFill(cells: Uint16Array, width: number, height: number, start: number, value: number) {
  const target = cells[start];
  if (target === value) return [] as CellChange[];
  const changes: CellChange[] = [];
  const queue = [start];
  const seen = new Uint8Array(cells.length); seen[start] = 1;
  while (queue.length) {
    const i = queue.pop()!;
    if (cells[i] !== target) continue;
    changes.push({ index: i, before: target, after: value });
    const x = i % width, y = Math.floor(i / width);
    const neighbors = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1];
    for (const n of neighbors) if (n >= 0 && !seen[n]) { seen[n] = 1; queue.push(n); }
  }
  return changes;
}

export function colorUsage(project: PixelProject) {
  const counts = new Map<number, number>();
  project.cells.forEach((v) => { if (v) counts.set(v, (counts.get(v) || 0) + 1); });
  return counts;
}

export function parsePalette(text: string, filename: string): PaletteColor[] {
  let rows: { brand: string; code: string; name: string; hex: string; finish?: string }[];
  if (filename.toLowerCase().endsWith(".json")) rows = JSON.parse(text);
  else {
    const lines = text.trim().split(/\r?\n/); const heads = lines.shift()!.split(",").map((x) => x.trim());
    rows = lines.map((line) => { const v = line.split(",").map((x) => x.trim()); return Object.fromEntries(heads.map((h, i) => [h, v[i]])) as typeof rows[number]; });
  }
  if (!Array.isArray(rows) || !rows.length) throw new Error("色板为空");
  return rows.map((r, i) => {
    if (!r.brand || !r.code || !r.name || !/^#[0-9a-f]{6}$/i.test(r.hex)) throw new Error(`第 ${i + 1} 行格式不正确`);
    return { ...r, index: i + 1, hex: r.hex.toUpperCase(), rgb: hexRgb(r.hex) };
  });
}
