import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { PaletteColor, PixelProject } from "./editor-core";

export type PdfContentMode = "reference" | "progress" | "overlay";
export type PdfLayoutMode = "overview" | "construction";

export type PdfExportOptions = {
  contentMode?: PdfContentMode;
  layoutMode?: PdfLayoutMode;
  titlePng?: Uint8Array;
};

const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const PT_PER_MM = 72 / 25.4;
const MARGIN = 34;
const COLORS = {
  ink: rgb(0.20, 0.25, 0.36),
  muted: rgb(0.43, 0.49, 0.61),
  line: rgb(0.84, 0.87, 0.93),
  panel: rgb(0.97, 0.98, 1),
  blue: rgb(0.48, 0.67, 0.94),
  purple: rgb(0.60, 0.51, 0.87),
  pink: rgb(0.93, 0.62, 0.78),
};

type Fonts = { regular: PDFFont; bold: PDFFont };
type Material = { color: PaletteColor; count: number; symbol: string };

export function millimetersToPoints(value: number) { return value * PT_PER_MM; }

function symbolFor(position: number) {
  if (position < 9) return String(position + 1);
  let n = position - 9;
  let result = "";
  do { result = String.fromCharCode(65 + (n % 26)) + result; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return result;
}

function safePdfText(value: string) {
  const ascii = value.normalize("NFKD").replace(/[^\x20-\x7e]/g, "").trim();
  return ascii || "PixelSnack Pattern";
}

function getPatternCells(project: PixelProject, mode: PdfContentMode) {
  if (mode === "progress") return project.cells;
  return project.guideCells ?? project.cells;
}

export function recommendedPdfLayout(project: PixelProject): PdfLayoutMode {
  return project.width <= project.board.width && project.height <= project.board.height ? "overview" : "construction";
}

function countCells(cells: Uint16Array) {
  const result = new Map<number, number>();
  for (const value of cells) if (value) result.set(value, (result.get(value) || 0) + 1);
  return result;
}

function buildMaterials(project: PixelProject, cells: Uint16Array) {
  const usage = countCells(cells);
  return project.palette
    .filter((color) => usage.has(color.index))
    .map((color, index) => ({ color, count: usage.get(color.index)!, symbol: symbolFor(index) }));
}

function drawPageChrome(page: PDFPage, fonts: Fonts, pageNumber: number, pageCount: number) {
  const [pageW, pageH] = A4_LANDSCAPE;
  page.drawRectangle({ x: 0, y: pageH - 68, width: pageW, height: 68, color: rgb(0.985, 0.988, 1) });
  page.drawRectangle({ x: 0, y: pageH - 5, width: pageW * 0.48, height: 5, color: COLORS.blue });
  page.drawRectangle({ x: pageW * 0.48, y: pageH - 5, width: pageW * 0.28, height: 5, color: COLORS.purple });
  page.drawRectangle({ x: pageW * 0.76, y: pageH - 5, width: pageW * 0.24, height: 5, color: COLORS.pink });
  page.drawCircle({ x: pageW - 47, y: pageH - 34, size: 13, color: COLORS.purple, opacity: 0.18 });
  page.drawCircle({ x: pageW - 34, y: pageH - 28, size: 8, color: COLORS.pink, opacity: 0.25 });
  page.drawText("PIXELSNACK / BEAD PATTERN", { x: MARGIN, y: pageH - 25, size: 8, font: fonts.bold, color: COLORS.purple });
  page.drawText(`PAGE ${pageNumber} / ${pageCount}`, { x: pageW - 105, y: 18, size: 7, font: fonts.bold, color: COLORS.muted });
}

async function drawProjectTitle(page: PDFPage, doc: PDFDocument, fonts: Fonts, project: PixelProject, titlePng?: Uint8Array, subtitle?: string) {
  const pageH = A4_LANDSCAPE[1];
  if (titlePng) {
    const image = await doc.embedPng(titlePng);
    const maxW = 450, maxH = 25;
    const scale = Math.min(maxW / image.width, maxH / image.height);
    page.drawImage(image, { x: MARGIN, y: pageH - 57, width: image.width * scale, height: image.height * scale });
  } else {
    page.drawText(safePdfText(project.name), { x: MARGIN, y: pageH - 52, size: 19, font: fonts.bold, color: COLORS.ink });
  }
  if (subtitle) page.drawText(subtitle, { x: 520, y: pageH - 48, size: 8, font: fonts.regular, color: COLORS.muted });
}

function drawCell(page: PDFPage, color: PaletteColor | undefined, x: number, y: number, size: number, opacity = 1) {
  if (!color) return;
  page.drawRectangle({ x, y, width: size, height: size, color: rgb(color.rgb[0] / 255, color.rgb[1] / 255, color.rgb[2] / 255), opacity });
}

function drawOverviewGrid(page: PDFPage, project: PixelProject, cells: Uint16Array, mode: PdfContentMode, colors: Map<number, PaletteColor>) {
  const area = { x: MARGIN + 25, y: 78, width: 500, height: 420 };
  const cell = Math.min(area.width / project.width, area.height / project.height);
  const width = cell * project.width, height = cell * project.height;
  const ox = area.x + (area.width - width) / 2, oy = area.y + (area.height - height) / 2;
  page.drawRectangle({ x: ox - 8, y: oy - 8, width: width + 16, height: height + 16, color: rgb(1, 1, 1), borderColor: COLORS.line, borderWidth: 0.8 });

  for (let y = 0; y < project.height; y++) for (let x = 0; x < project.width; x++) {
    const index = y * project.width + x;
    const target = cells[index];
    drawCell(page, colors.get(target), ox + x * cell, oy + (project.height - 1 - y) * cell, cell, mode === "overlay" ? 0.25 : 1);
    if (mode === "overlay" && project.cells[index]) drawCell(page, colors.get(project.cells[index]), ox + x * cell, oy + (project.height - 1 - y) * cell, cell, 1);
  }
  if (cell >= 5) {
    for (let x = 0; x <= project.width; x++) page.drawLine({ start: { x: ox + x * cell, y: oy }, end: { x: ox + x * cell, y: oy + height }, thickness: 0.25, color: COLORS.line });
    for (let y = 0; y <= project.height; y++) page.drawLine({ start: { x: ox, y: oy + y * cell }, end: { x: ox + width, y: oy + y * cell }, thickness: 0.25, color: COLORS.line });
  }
  const step = cell >= 8 ? 1 : cell >= 4 ? 5 : 10;
  for (let x = 0; x < project.width; x += step) page.drawText(String(x + 1), { x: ox + x * cell + 1, y: oy + height + 10, size: 5.5, color: COLORS.muted });
  for (let y = 0; y < project.height; y += step) page.drawText(String(y + 1), { x: ox - 20, y: oy + height - (y + 0.7) * cell, size: 5.5, color: COLORS.muted });
}

function drawMaterialItem(page: PDFPage, fonts: Fonts, item: Material, x: number, y: number, width = 106) {
  const { color } = item;
  page.drawRectangle({ x, y: y - 2, width: 13, height: 13, color: rgb(color.rgb[0] / 255, color.rgb[1] / 255, color.rgb[2] / 255), borderColor: COLORS.line, borderWidth: 0.5 });
  page.drawText(item.symbol, { x: x + 4, y: y + 1, size: 5.5, font: fonts.bold, color: luminance(color.rgb) > 0.56 ? COLORS.ink : rgb(1, 1, 1) });
  page.drawText(color.code, { x: x + 18, y: y + 4, size: 7, font: fonts.bold, color: COLORS.ink, maxWidth: width - 20 });
  page.drawText(`${item.count.toLocaleString()} pcs`, { x: x + 18, y: y - 5, size: 5.5, font: fonts.regular, color: COLORS.muted });
}

function drawOverviewSidebar(page: PDFPage, fonts: Fonts, project: PixelProject, materials: Material[], targetCells: Uint16Array) {
  const x = 570, width = 238;
  const targetCount = targetCells.reduce((sum, value) => sum + (value ? 1 : 0), 0);
  const placedCount = project.cells.reduce((sum, value) => sum + (value ? 1 : 0), 0);
  page.drawRectangle({ x, y: 412, width, height: 86, color: COLORS.panel, borderColor: COLORS.line, borderWidth: 0.7 });
  page.drawText("PROJECT SUMMARY", { x: x + 15, y: 477, size: 8, font: fonts.bold, color: COLORS.purple });
  page.drawText(`${project.width} x ${project.height} BEADS`, { x: x + 15, y: 455, size: 15, font: fonts.bold, color: COLORS.ink });
  page.drawText(`${Math.ceil(project.width / project.board.width)} x ${Math.ceil(project.height / project.board.height)} boards  /  ${project.board.width} x ${project.board.height} board`, { x: x + 15, y: 438, size: 7, font: fonts.regular, color: COLORS.muted });
  page.drawText(`${targetCount.toLocaleString()} target  /  ${placedCount.toLocaleString()} placed`, { x: x + 15, y: 421, size: 7, font: fonts.regular, color: COLORS.muted });

  page.drawText("MATERIALS", { x, y: 390, size: 9, font: fonts.bold, color: COLORS.ink });
  page.drawText(`${materials.length} colors`, { x: x + 178, y: 390, size: 7, font: fonts.regular, color: COLORS.muted });
  const visible = materials.slice(0, 24);
  visible.forEach((item, index) => drawMaterialItem(page, fonts, item, x + (index % 2) * 119, 365 - Math.floor(index / 2) * 24));
  if (materials.length > visible.length) page.drawText(`+ ${materials.length - visible.length} more colors - use construction PDF for the full list`, { x, y: 65, size: 7, font: fonts.regular, color: COLORS.purple });
}

function boardLabel(px: number, py: number) { return `${String.fromCharCode(65 + (px % 26))}${py + 1}`; }

function drawBoardPage(page: PDFPage, fonts: Fonts, project: PixelProject, targetCells: Uint16Array, mode: PdfContentMode, colors: Map<number, PaletteColor>, materialByIndex: Map<number, Material>, px: number, py: number) {
  const boardW = project.board.width, boardH = project.board.height;
  const cols = Math.min(boardW, project.width - px * boardW), rows = Math.min(boardH, project.height - py * boardH);
  const maxGridW = 548, maxGridH = 434;
  const cell = Math.min(maxGridW / cols, maxGridH / rows);
  const gridW = cols * cell, gridH = rows * cell;
  const ox = MARGIN + 26 + (maxGridW - gridW) / 2, oy = 67 + (maxGridH - gridH) / 2;
  const used = new Map<number, number>();

  page.drawRectangle({ x: ox - 8, y: oy - 8, width: gridW + 16, height: gridH + 16, color: rgb(1, 1, 1), borderColor: COLORS.line, borderWidth: 0.8 });
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const globalX = px * boardW + x, globalY = py * boardH + y, index = globalY * project.width + globalX;
    const value = targetCells[index];
    if (value) used.set(value, (used.get(value) || 0) + 1);
    const cy = oy + (rows - 1 - y) * cell;
    drawCell(page, colors.get(value), ox + x * cell, cy, cell, mode === "overlay" ? 0.25 : 1);
    if (mode === "overlay" && project.cells[index]) drawCell(page, colors.get(project.cells[index]), ox + x * cell, cy, cell, 1);
    page.drawRectangle({ x: ox + x * cell, y: cy, width: cell, height: cell, borderColor: rgb(0.55, 0.59, 0.67), borderWidth: 0.35 });
    if (value && cell >= 10) {
      const material = materialByIndex.get(value);
      if (material) page.drawText(material.symbol, { x: ox + x * cell + 2.2, y: cy + cell / 2 - 2.5, size: Math.min(7, cell * 0.38), font: fonts.bold, color: luminance(colors.get(value)!.rgb) > 0.56 ? COLORS.ink : rgb(1, 1, 1) });
    }
  }
  for (let x = 0; x < cols; x++) page.drawText(String(px * boardW + x + 1), { x: ox + x * cell + 1, y: oy + gridH + 10, size: 5.5, font: fonts.regular, color: COLORS.muted });
  for (let y = 0; y < rows; y++) page.drawText(String(py * boardH + y + 1), { x: ox - 23, y: oy + gridH - (y + 0.68) * cell, size: 5.5, font: fonts.regular, color: COLORS.muted });

  const sideX = 634;
  page.drawText(`BOARD ${boardLabel(px, py)}`, { x: sideX, y: 487, size: 17, font: fonts.bold, color: COLORS.ink });
  page.drawText(`columns ${px * boardW + 1}-${px * boardW + cols}  /  rows ${py * boardH + 1}-${py * boardH + rows}`, { x: sideX, y: 471, size: 7, font: fonts.regular, color: COLORS.muted });
  drawMiniMap(page, project, targetCells, colors, px, py, sideX, 350, 168, 102);
  page.drawText("BOARD MATERIALS", { x: sideX, y: 326, size: 8, font: fonts.bold, color: COLORS.purple });
  const entries = [...used].map(([index, count]) => ({ ...materialByIndex.get(index)!, count })).filter((item) => item.color).slice(0, 18);
  entries.forEach((item, index) => drawMaterialItem(page, fonts, item, sideX + (index % 2) * 87, 301 - Math.floor(index / 2) * 25, 84));

  const rulerY = 38, rulerX = MARGIN, rulerLength = millimetersToPoints(100);
  page.drawLine({ start: { x: rulerX, y: rulerY }, end: { x: rulerX + rulerLength, y: rulerY }, thickness: 0.8, color: COLORS.ink });
  page.drawLine({ start: { x: rulerX, y: rulerY - 3 }, end: { x: rulerX, y: rulerY + 3 }, thickness: 0.8, color: COLORS.ink });
  page.drawLine({ start: { x: rulerX + rulerLength, y: rulerY - 3 }, end: { x: rulerX + rulerLength, y: rulerY + 3 }, thickness: 0.8, color: COLORS.ink });
  page.drawText("PRINT CHECK: line must measure 100 mm. Grid is fit to page.", { x: rulerX, y: 25, size: 6.5, font: fonts.regular, color: COLORS.muted });
}

function drawMiniMap(page: PDFPage, project: PixelProject, cells: Uint16Array, colors: Map<number, PaletteColor>, px: number, py: number, x: number, y: number, width: number, height: number) {
  const cell = Math.min(width / project.width, height / project.height);
  const mapW = project.width * cell, mapH = project.height * cell;
  page.drawRectangle({ x, y, width: mapW, height: mapH, color: rgb(1, 1, 1), borderColor: COLORS.line, borderWidth: 0.6 });
  for (let gy = 0; gy < project.height; gy++) for (let gx = 0; gx < project.width; gx++) {
    const value = cells[gy * project.width + gx];
    if (value) drawCell(page, colors.get(value), x + gx * cell, y + (project.height - 1 - gy) * cell, cell, 0.72);
  }
  const startX = px * project.board.width, startY = py * project.board.height;
  const cols = Math.min(project.board.width, project.width - startX), rows = Math.min(project.board.height, project.height - startY);
  page.drawRectangle({ x: x + startX * cell, y: y + (project.height - startY - rows) * cell, width: cols * cell, height: rows * cell, borderColor: COLORS.pink, borderWidth: 2 });
}

function drawMaterialsAppendix(page: PDFPage, fonts: Fonts, materials: Material[], start: number) {
  page.drawText("MATERIALS APPENDIX", { x: MARGIN, y: 500, size: 19, font: fonts.bold, color: COLORS.ink });
  page.drawText("Symbol / full color code / required bead count", { x: MARGIN, y: 482, size: 8, font: fonts.regular, color: COLORS.muted });
  materials.slice(start, start + 48).forEach((item, index) => {
    const column = index % 4, row = Math.floor(index / 4);
    drawMaterialItem(page, fonts, item, MARGIN + column * 195, 447 - row * 31, 184);
    page.drawText(item.color.name.slice(0, 22), { x: MARGIN + column * 195 + 82, y: 451 - row * 31, size: 6, font: fonts.regular, color: COLORS.muted });
  });
}

export async function createPdfBytes(project: PixelProject, options: PdfExportOptions = {}) {
  const mode = options.contentMode ?? (project.guideCells ? "reference" : "progress");
  const layout = options.layoutMode ?? recommendedPdfLayout(project);
  const targetCells = getPatternCells(project, mode);
  const colors = new Map(project.palette.map((color) => [color.index, color]));
  const materials = buildMaterials(project, targetCells);
  const materialByIndex = new Map(materials.map((material) => [material.color.index, material]));
  const pagesX = Math.ceil(project.width / project.board.width), pagesY = Math.ceil(project.height / project.board.height);
  const appendixPages = layout === "construction" && materials.length > 24 ? Math.ceil(materials.length / 48) : 0;
  const pageCount = layout === "overview" ? 1 : 1 + pagesX * pagesY + appendixPages;
  const doc = await PDFDocument.create();
  const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  doc.setTitle(project.name); doc.setAuthor("PixelSnack"); doc.setSubject("Pixel bead assembly pattern"); doc.setCreator("PixelSnack");

  let pageNumber = 1;
  const overview = doc.addPage(A4_LANDSCAPE);
  drawPageChrome(overview, fonts, pageNumber++, pageCount);
  await drawProjectTitle(overview, doc, fonts, project, options.titlePng, `${project.width} x ${project.height} / OVERVIEW`);
  drawOverviewGrid(overview, project, targetCells, mode, colors);
  drawOverviewSidebar(overview, fonts, project, materials, targetCells);

  if (layout === "construction") for (let py = 0; py < pagesY; py++) for (let px = 0; px < pagesX; px++) {
    const page = doc.addPage(A4_LANDSCAPE);
    drawPageChrome(page, fonts, pageNumber++, pageCount);
    await drawProjectTitle(page, doc, fonts, project, options.titlePng, `BOARD ${boardLabel(px, py)} / ${pagesX * pagesY}`);
    drawBoardPage(page, fonts, project, targetCells, mode, colors, materialByIndex, px, py);
  }
  for (let start = 0; start < materials.length && layout === "construction" && materials.length > 24; start += 48) {
    const page = doc.addPage(A4_LANDSCAPE);
    drawPageChrome(page, fonts, pageNumber++, pageCount);
    await drawProjectTitle(page, doc, fonts, project, options.titlePng, "MATERIALS");
    drawMaterialsAppendix(page, fonts, materials, start);
  }
  return doc.save();
}

export function expectedPdfPageCount(project: PixelProject, mode: PdfContentMode = project.guideCells ? "reference" : "progress", layout: PdfLayoutMode = recommendedPdfLayout(project)) {
  const materialCount = buildMaterials(project, getPatternCells(project, mode)).length;
  if (layout === "overview") return 1;
  return 1 + Math.ceil(project.width / project.board.width) * Math.ceil(project.height / project.board.height) + (materialCount > 24 ? Math.ceil(materialCount / 48) : 0);
}

function luminance([r, g, b]: [number, number, number]) { return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }
