"use client";
import Dexie, { type EntityTable } from "dexie";
import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { PixelProject } from "./editor-core";

type StoredProject = Omit<PixelProject, "cells" | "guideCells"> & { cells: ArrayBuffer; guideCells?: ArrayBuffer };
const db = new Dexie("pixelsnack") as Dexie & { projects: EntityTable<StoredProject, "id"> };
db.version(1).stores({ projects: "id,updatedAt" });

function stored(project: PixelProject): StoredProject {
  const cells = project.cells.slice().buffer;
  const guideCells = project.guideCells?.slice().buffer;
  return { ...project, cells, guideCells };
}

function restored(project: StoredProject): PixelProject {
  return { ...project, cells: new Uint16Array(project.cells), guideCells: project.guideCells ? new Uint16Array(project.guideCells) : undefined };
}

export async function saveLocal(project: PixelProject) { await db.projects.put(stored(project)); }
export async function loadLatest() {
  const row = await db.projects.orderBy("updatedAt").last();
  return row ? restored(row) : null;
}

function renderProject(project: PixelProject, scale = 12, grid = false, transparent = false) {
  const canvas = document.createElement("canvas"); canvas.width = project.width * scale; canvas.height = project.height * scale;
  const ctx = canvas.getContext("2d")!;
  if (!transparent) { ctx.fillStyle = "#f7f4eb"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  const byIndex = new Map(project.palette.map((c) => [c.index, c]));
  project.cells.forEach((v, i) => {
    if (!v) return; const x = i % project.width, y = Math.floor(i / project.width);
    ctx.fillStyle = byIndex.get(v)?.hex || "#ff00ff"; ctx.fillRect(x * scale, y * scale, scale, scale);
  });
  if (grid && scale >= 4) {
    ctx.strokeStyle = "rgba(15,18,24,.24)"; ctx.lineWidth = 1;
    for (let x = 0; x <= project.width; x++) { ctx.beginPath(); ctx.moveTo(x * scale + .5, 0); ctx.lineTo(x * scale + .5, canvas.height); ctx.stroke(); }
    for (let y = 0; y <= project.height; y++) { ctx.beginPath(); ctx.moveTo(0, y * scale + .5); ctx.lineTo(canvas.width, y * scale + .5); ctx.stroke(); }
  }
  return canvas;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportPng(project: PixelProject, scale = 12, grid = false, transparent = false) {
  const blob = await new Promise<Blob>((resolve, reject) => renderProject(project, scale, grid, transparent).toBlob((b) => b ? resolve(b) : reject(new Error("PNG 生成失败")), "image/png"));
  download(blob, `${safeName(project.name)}.png`);
}

export async function exportProject(project: PixelProject) {
  const zip = new JSZip();
  const manifest = { schemaVersion: project.schemaVersion, id: project.id, name: project.name, width: project.width, height: project.height, palette: project.palette, board: project.board, createdAt: project.createdAt, updatedAt: project.updatedAt, hasGuide: Boolean(project.guideCells) };
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("cells.bin", project.cells.slice().buffer);
  if (project.guideCells) zip.file("guide.bin", project.guideCells.slice().buffer);
  const preview = await new Promise<Blob>((resolve) => renderProject(project, 4).toBlob((b) => resolve(b!), "image/png"));
  zip.file("preview.png", preview);
  download(await zip.generateAsync({ type: "blob" }), `${safeName(project.name)}.pixelsnack`);
}

export async function importProject(file: File): Promise<PixelProject> {
  const zip = await JSZip.loadAsync(file); const manifestFile = zip.file("manifest.json"), cellsFile = zip.file("cells.bin");
  if (!manifestFile || !cellsFile) throw new Error("工程包缺少 manifest.json 或 cells.bin");
  const manifest = JSON.parse(await manifestFile.async("string"));
  if (manifest.schemaVersion !== 1 || manifest.width < 1 || manifest.height < 1 || manifest.width > 256 || manifest.height > 256) throw new Error("不支持的工程版本或尺寸");
  const data = await cellsFile.async("arraybuffer");
  if (data.byteLength !== manifest.width * manifest.height * 2) throw new Error("画布数据长度不正确");
  const guideFile = zip.file("guide.bin");
  const guideData = guideFile ? await guideFile.async("arraybuffer") : undefined;
  if (guideData && guideData.byteLength !== manifest.width * manifest.height * 2) throw new Error("参考底图数据长度不正确");
  const { hasGuide: _hasGuide, ...projectManifest } = manifest;
  void _hasGuide;
  return { ...projectManifest, cells: new Uint16Array(data), guideCells: guideData ? new Uint16Array(guideData) : undefined, id: crypto.randomUUID(), updatedAt: new Date().toISOString() };
}

export async function exportPdf(project: PixelProject) {
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica); const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const pageW = 841.89, pageH = 595.28, margin = 34; const boardW = project.board.width, boardH = project.board.height;
  const colors = new Map(project.palette.map((c) => [c.index, c]));
  const pagesX = Math.ceil(project.width / boardW), pagesY = Math.ceil(project.height / boardH);
  for (let py = 0; py < pagesY; py++) for (let px = 0; px < pagesX; px++) {
    const page = doc.addPage([pageW, pageH]);
    page.drawText(`${project.name}  /  BOARD ${px + 1}.${py + 1}`, { x: margin, y: pageH - 28, size: 12, font: bold, color: rgb(.06, .1, .14) });
    const cols = Math.min(boardW, project.width - px * boardW), rows = Math.min(boardH, project.height - py * boardH);
    const cell = Math.min((pageW - margin * 2 - 180) / cols, (pageH - margin * 2 - 28) / rows);
    const ox = margin, oy = pageH - 52 - rows * cell;
    const used = new Map<number, number>();
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const value = project.cells[(py * boardH + y) * project.width + px * boardW + x]; const c = colors.get(value);
      if (c) { page.drawRectangle({ x: ox + x * cell, y: oy + (rows - 1 - y) * cell, width: cell, height: cell, color: rgb(c.rgb[0] / 255, c.rgb[1] / 255, c.rgb[2] / 255) }); used.set(value, (used.get(value) || 0) + 1); }
      page.drawRectangle({ x: ox + x * cell, y: oy + (rows - 1 - y) * cell, width: cell, height: cell, borderColor: rgb(.35, .38, .42), borderWidth: .35 });
      if (c && cell >= 11) page.drawText(c.code.replace(/\D/g, "").slice(-2), { x: ox + x * cell + 2, y: oy + (rows - 1 - y) * cell + cell / 2 - 2.5, size: Math.min(6, cell * .35), font, color: luminance(c.rgb) > .55 ? rgb(.08, .08, .1) : rgb(1, 1, 1) });
    }
    let ly = pageH - 58; page.drawText("MATERIALS", { x: pageW - 160, y: ly, size: 10, font: bold }); ly -= 18;
    [...used].forEach(([i, count]) => { const c = colors.get(i)!; page.drawRectangle({ x: pageW - 160, y: ly - 2, width: 9, height: 9, color: rgb(...c.rgb.map((v) => v / 255) as [number, number, number]) }); page.drawText(`${c.code}  x ${count}`, { x: pageW - 145, y: ly, size: 8, font }); ly -= 14; });
    page.drawLine({ start: { x: pageW - 160, y: 36 }, end: { x: pageW - 60, y: 36 }, thickness: 1 }); page.drawText("100 mm calibration", { x: pageW - 160, y: 24, size: 7, font });
  }
  download(new Blob([await doc.save()], { type: "application/pdf" }), `${safeName(project.name)}-pattern.pdf`);
}

function luminance([r, g, b]: [number, number, number]) { return (.2126 * r + .7152 * g + .0722 * b) / 255; }
function safeName(name: string) { return name.trim().replace(/[\\/:*?"<>|]+/g, "-") || "pixelsnack"; }
