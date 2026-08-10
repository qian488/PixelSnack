"use client";
import Dexie, { type EntityTable } from "dexie";
import { PixelProject, validateProject } from "./editor-core";
import { createPdfBytes, type PdfExportOptions } from "./pdf-export";

type StoredProject = Omit<PixelProject, "cells" | "guideCells"> & { cells: ArrayBuffer; guideCells?: ArrayBuffer };
const db = new Dexie("pixelsnack") as Dexie & { projects: EntityTable<StoredProject, "id"> };
db.version(1).stores({ projects: "id,updatedAt" });

function stored(project: PixelProject): StoredProject {
  const cells = project.cells.slice().buffer;
  const guideCells = project.guideCells?.slice().buffer;
  return { ...project, cells, guideCells };
}

function restored(project: StoredProject): PixelProject {
  return validateProject({ ...project, cells: new Uint16Array(project.cells), guideCells: project.guideCells ? new Uint16Array(project.guideCells) : undefined });
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
  const { default: JSZip } = await import("jszip");
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
  const { default: JSZip } = await import("jszip");
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
  return validateProject({ ...projectManifest, cells: new Uint16Array(data), guideCells: guideData ? new Uint16Array(guideData) : undefined, id: crypto.randomUUID(), updatedAt: new Date().toISOString() });
}

export async function exportPdf(project: PixelProject, options: PdfExportOptions = {}) {
  const titlePng = await renderPdfTitle(project.name);
  const bytes = await createPdfBytes(project, { ...options, titlePng });
  download(new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" }), `${safeName(project.name)}-pattern.pdf`);
}

async function renderPdfTitle(title: string) {
  const canvas = document.createElement("canvas"); canvas.width = 1400; canvas.height = 100;
  const ctx = canvas.getContext("2d")!; ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#33415c"; ctx.font = '700 54px Inter, "Noto Sans SC", "Microsoft YaHei", sans-serif'; ctx.textBaseline = "middle";
  ctx.fillText(title || "PixelSnack Pattern", 0, canvas.height / 2, canvas.width - 8);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined;
}

function safeName(name: string) { return name.trim().replace(/[\\/:*?"<>|]+/g, "-") || "pixelsnack"; }
