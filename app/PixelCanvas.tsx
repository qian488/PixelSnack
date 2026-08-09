"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CellChange, lineCells } from "./editor-core";
import { useEditor } from "./editor-store";

type View = { scale: number; x: number; y: number };
type SharedView = View & { viewportWidth: number; viewportHeight: number };

export function PixelCanvas({ onZoom }: { onZoom?: (value: number) => void }) {
  const wrap = useRef<HTMLDivElement>(null); const bg = useRef<HTMLCanvasElement>(null); const art = useRef<HTMLCanvasElement>(null); const ui = useRef<HTMLCanvasElement>(null);
  const { project, revision, tool, color, brushSize, showGrid, showBoards, apply, fill, setColor } = useEditor();
  const view = useRef<View>({ scale: 12, x: 0, y: 0 }); const [viewRevision, setViewRevision] = useState(0);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; scale: number; x: number; y: number; midX: number; midY: number } | null>(null);
  const stroke = useRef<{ last: [number, number]; changes: Map<number, CellChange> } | null>(null);
  const pan = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const resize = useCallback(() => {
    const el = wrap.current; if (!el) return; const rect = el.getBoundingClientRect(); const dpr = Math.min(devicePixelRatio || 1, 2);
    for (const ref of [bg, art, ui]) { const c = ref.current!; c.width = Math.max(1, rect.width * dpr); c.height = Math.max(1, rect.height * dpr); c.style.width = `${rect.width}px`; c.style.height = `${rect.height}px`; }
    setViewRevision((n) => n + 1);
  }, []);

  const fit = useCallback(() => {
    const rect = wrap.current?.getBoundingClientRect(); if (!rect) return;
    const scale = Math.max(.1, Math.min(rect.width / project.width, rect.height / project.height) * .86);
    view.current = { scale, x: (rect.width - project.width * scale) / 2, y: (rect.height - project.height * scale) / 2 };
    onZoom?.(scale); setViewRevision((n) => n + 1);
  }, [project.width, project.height, onZoom]);

  useLayoutEffect(() => { const ro = new ResizeObserver(resize); if (wrap.current) ro.observe(wrap.current); resize(); return () => ro.disconnect(); }, [resize]);
  useEffect(() => { fit(); }, [fit]);
  useEffect(() => {
    const handleFit = () => fit(); const handle100 = () => { const rect = wrap.current?.getBoundingClientRect(); if (!rect) return; view.current = { scale: 16, x: (rect.width - project.width * 16) / 2, y: (rect.height - project.height * 16) / 2 }; onZoom?.(16); setViewRevision((n) => n + 1); };
    const handleSetZoom = (event: Event) => {
      const rect = wrap.current?.getBoundingClientRect(); if (!rect) return;
      const before = view.current; const scale = Math.max(.1, Math.min(64, (event as CustomEvent<number>).detail));
      const worldX = (rect.width / 2 - before.x) / before.scale, worldY = (rect.height / 2 - before.y) / before.scale;
      view.current = { scale, x: rect.width / 2 - worldX * scale, y: rect.height / 2 - worldY * scale };
      onZoom?.(scale); setViewRevision((n) => n + 1);
    };
    const handleCenter = (event: Event) => { const rect = wrap.current?.getBoundingClientRect(); if (!rect) return; const point = (event as CustomEvent<{ x: number; y: number }>).detail; view.current = { ...view.current, x: rect.width / 2 - point.x * view.current.scale, y: rect.height / 2 - point.y * view.current.scale }; setViewRevision((n) => n + 1); };
    window.addEventListener("pixelsnack:fit", handleFit); window.addEventListener("pixelsnack:100", handle100); window.addEventListener("pixelsnack:setzoom", handleSetZoom); window.addEventListener("pixelsnack:center", handleCenter);
    return () => { window.removeEventListener("pixelsnack:fit", handleFit); window.removeEventListener("pixelsnack:100", handle100); window.removeEventListener("pixelsnack:setzoom", handleSetZoom); window.removeEventListener("pixelsnack:center", handleCenter); };
  }, [fit, onZoom, project.width, project.height]);

  useEffect(() => { const rect = wrap.current?.getBoundingClientRect(); if (!rect) return; window.dispatchEvent(new CustomEvent<SharedView>("pixelsnack:viewchange", { detail: { ...view.current, viewportWidth: rect.width, viewportHeight: rect.height } })); }, [viewRevision]);

  useEffect(() => {
    const dpr = Math.min(devicePixelRatio || 1, 2); const v = view.current; const palette = new Map(project.palette.map((c) => [c.index, c.hex]));
    const setup = (c: HTMLCanvasElement) => { const ctx = c.getContext("2d")!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, c.width / dpr, c.height / dpr); return ctx; };
    const b = setup(bg.current!); const a = setup(art.current!); setup(ui.current!);
    b.save(); b.translate(v.x, v.y); b.fillStyle = "#f8f6ef"; b.shadowColor = "rgba(9,13,18,.35)"; b.shadowBlur = 22; b.fillRect(0, 0, project.width * v.scale, project.height * v.scale); b.restore();
    a.save(); a.translate(v.x, v.y); a.imageSmoothingEnabled = false;
    if (project.guideCells) {
      a.globalAlpha = .22;
      project.guideCells.forEach((value, i) => { if (!value || project.cells[i]) return; a.fillStyle = palette.get(value) || "#ff00ff"; a.fillRect((i % project.width) * v.scale, Math.floor(i / project.width) * v.scale, Math.ceil(v.scale), Math.ceil(v.scale)); });
      a.globalAlpha = 1;
    }
    project.cells.forEach((value, i) => { if (!value) return; a.fillStyle = palette.get(value) || "#ff00ff"; a.fillRect((i % project.width) * v.scale, Math.floor(i / project.width) * v.scale, Math.ceil(v.scale), Math.ceil(v.scale)); });
    a.restore();
    b.save(); b.translate(v.x, v.y);
    if (showGrid && v.scale >= 5) { b.strokeStyle = v.scale > 14 ? "rgba(19,25,32,.18)" : "rgba(19,25,32,.1)"; b.lineWidth = 1; b.beginPath(); for (let x = 0; x <= project.width; x++) { b.moveTo(x * v.scale + .5, 0); b.lineTo(x * v.scale + .5, project.height * v.scale); } for (let y = 0; y <= project.height; y++) { b.moveTo(0, y * v.scale + .5); b.lineTo(project.width * v.scale, y * v.scale + .5); } b.stroke(); }
    if (showBoards) { b.strokeStyle = "rgba(0,220,226,.72)"; b.lineWidth = 1.5; b.setLineDash([6, 5]); for (let x = project.board.width; x < project.width; x += project.board.width) { b.beginPath(); b.moveTo(x * v.scale, 0); b.lineTo(x * v.scale, project.height * v.scale); b.stroke(); } for (let y = project.board.height; y < project.height; y += project.board.height) { b.beginPath(); b.moveTo(0, y * v.scale); b.lineTo(project.width * v.scale, y * v.scale); b.stroke(); } }
    b.restore();
  }, [project, revision, showGrid, showBoards, viewRevision]);

  const point = (e: React.PointerEvent) => { const r = ui.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const cellAt = (p: { x: number; y: number }): [number, number] | null => { const v = view.current; const x = Math.floor((p.x - v.x) / v.scale), y = Math.floor((p.y - v.y) / v.scale); return x >= 0 && y >= 0 && x < project.width && y < project.height ? [x, y] : null; };
  const addCells = (from: [number, number], to: [number, number]) => {
    if (!stroke.current) return; const value = tool === "eraser" ? 0 : color; const half = Math.floor((brushSize - 1) / 2);
    for (const [cx, cy] of lineCells(...from, ...to)) for (let oy = -half; oy < brushSize - half; oy++) for (let ox = -half; ox < brushSize - half; ox++) {
      const x = cx + ox, y = cy + oy; if (x < 0 || y < 0 || x >= project.width || y >= project.height) continue; const i = y * project.width + x;
      const existing = stroke.current.changes.get(i); stroke.current.changes.set(i, { index: i, before: existing?.before ?? project.cells[i], after: value });
    }
  };
  const previewStroke = () => {
    const c = ui.current; if (!c || !stroke.current) return; const dpr = Math.min(devicePixelRatio || 1, 2); const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, c.width / dpr, c.height / dpr); const v = view.current;
    const hex = project.palette.find((p) => p.index === color)?.hex || "#6ee7ef";
    stroke.current.changes.forEach((change) => { const x = change.index % project.width, y = Math.floor(change.index / project.width); if (tool === "eraser") { ctx.fillStyle = "rgba(255,255,255,.68)"; ctx.fillRect(v.x + x * v.scale, v.y + y * v.scale, v.scale, v.scale); ctx.strokeStyle = "#a22d52"; ctx.beginPath(); ctx.moveTo(v.x + x * v.scale, v.y + y * v.scale); ctx.lineTo(v.x + (x + 1) * v.scale, v.y + (y + 1) * v.scale); ctx.stroke(); } else { ctx.fillStyle = hex; ctx.fillRect(v.x + x * v.scale, v.y + y * v.scale, Math.ceil(v.scale), Math.ceil(v.scale)); } });
  };
  const commit = () => { if (stroke.current) apply([...stroke.current.changes.values()], tool === "eraser" ? "擦除" : "绘制"); stroke.current = null; };

  const pointerDown = (e: React.PointerEvent) => {
    const p = point(e); pointers.current.set(e.pointerId, p); ui.current!.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) { stroke.current = null; const ps = [...pointers.current.values()]; const midX = (ps[0].x + ps[1].x) / 2, midY = (ps[0].y + ps[1].y) / 2; gesture.current = { distance: Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y), scale: view.current.scale, x: view.current.x, y: view.current.y, midX, midY }; return; }
    const cell = cellAt(p); if (!cell) return;
    if (tool === "eyedropper") { const index = cell[1] * project.width + cell[0]; const value = project.cells[index] || project.guideCells?.[index]; if (value) setColor(value); return; }
    if (tool === "fill") { fill(cell[1] * project.width + cell[0]); return; }
    if (tool === "pan" || e.button === 1 || e.button === 2) { pan.current = { x: p.x, y: p.y, vx: view.current.x, vy: view.current.y }; return; }
    stroke.current = { last: cell, changes: new Map() }; addCells(cell, cell); previewStroke();
  };
  const pointerMove = (e: React.PointerEvent) => {
    const p = point(e); if (!pointers.current.has(e.pointerId)) return; pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 2 && gesture.current) { const ps = [...pointers.current.values()]; const distance = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y); const midX = (ps[0].x + ps[1].x) / 2, midY = (ps[0].y + ps[1].y) / 2; const g = gesture.current; const scale = Math.max(.1, Math.min(64, g.scale * distance / Math.max(1, g.distance))); const worldX = (g.midX - g.x) / g.scale, worldY = (g.midY - g.y) / g.scale; view.current = { scale, x: midX - worldX * scale, y: midY - worldY * scale }; onZoom?.(scale); setViewRevision((n) => n + 1); return; }
    if (pan.current) { view.current.x = pan.current.vx + p.x - pan.current.x; view.current.y = pan.current.vy + p.y - pan.current.y; setViewRevision((n) => n + 1); return; }
    const cell = cellAt(p); if (stroke.current && cell) { addCells(stroke.current.last, cell); stroke.current.last = cell; previewStroke(); }
  };
  const pointerUp = (e: React.PointerEvent) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) gesture.current = null; if (!pointers.current.size) { commit(); pan.current = null; } };
  const wheel = (e: React.WheelEvent) => { e.preventDefault(); const p = point(e as unknown as React.PointerEvent); const v = view.current; const factor = Math.exp(-e.deltaY * .0015); const scale = Math.max(.1, Math.min(64, v.scale * factor)); const wx = (p.x - v.x) / v.scale, wy = (p.y - v.y) / v.scale; view.current = { scale, x: p.x - wx * scale, y: p.y - wy * scale }; onZoom?.(scale); setViewRevision((n) => n + 1); };

  return <div className="canvas-wrap" ref={wrap} data-testid="editor-canvas">
    <canvas ref={bg} className="canvas-layer" aria-hidden="true" />
    <canvas ref={art} className="canvas-layer" aria-hidden="true" />
    <canvas ref={ui} className={`canvas-layer canvas-input tool-${tool}`} onContextMenu={(e) => e.preventDefault()} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onWheel={wheel} aria-label="拼豆编辑画布" />
    <div className="canvas-corners" aria-hidden="true"><i/><i/><i/><i/></div>
  </div>;
}

export function MiniMap() {
  const ref = useRef<HTMLCanvasElement>(null); const sharedView = useRef<SharedView | null>(null); const [viewRevision, setViewRevision] = useState(0); const { project, revision } = useEditor();
  useEffect(() => { const update = (event: Event) => { sharedView.current = (event as CustomEvent<SharedView>).detail; setViewRevision((value) => value + 1); }; window.addEventListener("pixelsnack:viewchange", update); return () => window.removeEventListener("pixelsnack:viewchange", update); }, []);
  useEffect(() => { const c = ref.current!; const dpr = devicePixelRatio || 1; const size = 152; c.width = size * dpr; c.height = size * dpr; const ctx = c.getContext("2d")!; ctx.scale(dpr, dpr); ctx.fillStyle = "#f6f5fb"; ctx.fillRect(0, 0, size, size); const scale = Math.min(size / project.width, size / project.height); const ox = (size - project.width * scale) / 2, oy = (size - project.height * scale) / 2; const p = new Map(project.palette.map((x) => [x.index, x.hex])); if (project.guideCells) { ctx.globalAlpha = .25; project.guideCells.forEach((v, i) => { if (!v || project.cells[i]) return; ctx.fillStyle = p.get(v)!; ctx.fillRect(ox + (i % project.width) * scale, oy + Math.floor(i / project.width) * scale, Math.ceil(scale), Math.ceil(scale)); }); ctx.globalAlpha = 1; } project.cells.forEach((v, i) => { if (!v) return; ctx.fillStyle = p.get(v)!; ctx.fillRect(ox + (i % project.width) * scale, oy + Math.floor(i / project.width) * scale, Math.ceil(scale), Math.ceil(scale)); }); const current = sharedView.current; if (current) { const left = Math.max(0, -current.x / current.scale), top = Math.max(0, -current.y / current.scale), right = Math.min(project.width, (current.viewportWidth - current.x) / current.scale), bottom = Math.min(project.height, (current.viewportHeight - current.y) / current.scale); ctx.fillStyle = "rgba(134,174,245,.13)"; ctx.strokeStyle = "#8d7ddd"; ctx.lineWidth = 2; ctx.fillRect(ox + left * scale, oy + top * scale, Math.max(2, (right - left) * scale), Math.max(2, (bottom - top) * scale)); ctx.strokeRect(ox + left * scale, oy + top * scale, Math.max(2, (right - left) * scale), Math.max(2, (bottom - top) * scale)); } ctx.strokeStyle = "#a58ae9"; ctx.lineWidth = 2; ctx.strokeRect(1, 1, size - 2, size - 2); }, [project, revision, viewRevision]);
  const navigate = (event: React.PointerEvent<HTMLCanvasElement>) => { const rect = event.currentTarget.getBoundingClientRect(), size = 152, scale = Math.min(size / project.width, size / project.height), ox = (size - project.width * scale) / 2, oy = (size - project.height * scale) / 2; const x = Math.max(0, Math.min(project.width, ((event.clientX - rect.left) / rect.width * size - ox) / scale)), y = Math.max(0, Math.min(project.height, ((event.clientY - rect.top) / rect.height * size - oy) / scale)); window.dispatchEvent(new CustomEvent("pixelsnack:center", { detail: { x, y } })); };
  return <canvas className="minimap" ref={ref} aria-label="作品导航缩略图，可拖动定位" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); navigate(event); }} onPointerMove={(event) => { if (event.buttons) navigate(event); }} />;
}
