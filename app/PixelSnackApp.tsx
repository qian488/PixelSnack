"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { colorUsage, createProject, parsePalette } from "./editor-core";
import { useEditor } from "./editor-store";
import { MiniMap, PixelCanvas } from "./PixelCanvas";
import { ImageConverter } from "./ImageConverter";
import { exportPdf, exportPng, exportProject, importProject, loadLatest, saveLocal } from "./project-io";

const tools = [
  { id: "pencil", icon: "✦", label: "画笔", key: "B" }, { id: "eraser", icon: "◇", label: "橡皮", key: "E" },
  { id: "fill", icon: "▰", label: "填充", key: "G" }, { id: "eyedropper", icon: "⌁", label: "吸管", key: "I" },
  { id: "pan", icon: "✥", label: "移动", key: "H" },
] as const;

export default function PixelSnackApp() {
  const editor = useEditor(); const { project } = editor;
  const [zoom, setZoom] = useState(12); const [search, setSearch] = useState(""); const [savedRevision, setSavedRevision] = useState(0);
  const [newOpen, setNewOpen] = useState(false); const [exportOpen, setExportOpen] = useState(false); const [convertOpen, setConvertOpen] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<"tools" | "colors" | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const [pngGrid, setPngGrid] = useState(false); const [pngTransparent, setPngTransparent] = useState(false); const [pngScale, setPngScale] = useState(12);
  const fileProject = useRef<HTMLInputElement>(null); const filePalette = useRef<HTMLInputElement>(null);
  const saved = savedRevision === editor.revision;
  const usage = useMemo(() => colorUsage(project), [project]); const total = useMemo(() => [...usage.values()].reduce((a, b) => a + b, 0), [usage]);
  const filtered = project.palette.filter((c) => `${c.code} ${c.name}`.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => { if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => undefined); }, []);
  useEffect(() => { loadLatest().then((p) => { if (p) editor.replaceProject(p); }).catch(() => setNotice("本地作品恢复失败，请使用工程文件导入。")); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(() => saveLocal(project).then(() => setSavedRevision(editor.revision)).catch(() => setNotice("自动保存失败，请立即导出工程文件备份。")), 1000); return () => clearTimeout(t); }, [project, editor.revision]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches("input,textarea,select")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) editor.redo(); else editor.undo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); editor.redo(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveLocal(project).then(() => { setSavedRevision(editor.revision); setNotice("已保存到本机"); setTimeout(() => setNotice(null), 2800); }); return; }
      const hit = tools.find((t) => t.key.toLowerCase() === e.key.toLowerCase()); if (hit) editor.setTool(hit.id);
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [editor, project]);

  const flash = (message: string) => { setNotice(message); setTimeout(() => setNotice(null), 2800); };
  const handleProject = async (file?: File) => { if (!file) return; try { editor.replaceProject(await importProject(file)); flash("工程已安全导入"); } catch (e) { flash(e instanceof Error ? e.message : "工程导入失败"); } };
  const handlePalette = async (file?: File) => { if (!file) return; try { const palette = parsePalette(await file.text(), file.name); const next = { ...project, palette, cells: new Uint16Array(project.cells.length), updatedAt: new Date().toISOString() }; editor.replaceProject(next); flash(`已导入 ${palette.length} 个色号，画布已清空以避免错色`); } catch (e) { flash(e instanceof Error ? e.message : "色板导入失败"); } };

  return <main className="app-shell">
    <div className="ambient ambient-a"/><div className="ambient ambient-b"/>
    <header className="topbar">
      <div className="brand-block"><button className="back-button" aria-label="返回作品列表">‹</button><div className="brand-mark">PS</div><div><div className="brand-name">PIXEL<span>SNACK</span></div><small>CYBER BEAD STUDIO</small></div></div>
      <div className="project-title"><span>PROJECT /</span><input aria-label="作品名称" value={project.name} onChange={(e) => editor.rename(e.target.value)} /><i className={saved ? "saved" : "saving"}>{saved ? "● 已保存" : "○ 保存中"}</i></div>
      <div className="top-actions">
        <button className="top-icon danger" onClick={() => { if (confirm("清空当前画布？此操作可以撤销。")) editor.clear(); }} aria-label="清空画布">⌫</button>
        <button className="top-icon" onClick={editor.undo} disabled={!editor.undoStack.length} aria-label="撤销">↶</button><button className="top-icon hide-mobile" onClick={editor.redo} disabled={!editor.redoStack.length} aria-label="重做">↷</button>
        <button className="save-button" onClick={() => saveLocal(project).then(() => flash("作品已保存到本机"))}><span>▣</span><b>保存</b><small>CTRL S</small></button>
        <button className="export-button" onClick={() => setExportOpen(true)}><span>✓</span>完成并导出</button>
      </div>
    </header>

    <section className="workspace">
      <aside className="left-panel panel">
        <div className="panel-heading"><span className="target">✥</span><div><b>导航器</b><small>NAVIGATOR</small></div><span className="live-dot">LIVE</span></div>
        <MiniMap />
        <div className="zoom-readout"><strong>{Math.round(zoom / 16 * 100)}%</strong><span>{project.width} × {project.height}</span></div>
        <input className="vertical-range" aria-label="缩放比例" type="range" min="10" max="400" value={Math.min(400, Math.max(10, Math.round(zoom / 16 * 100)))} readOnly />
        <div className="navigator-actions"><button onClick={() => window.dispatchEvent(new Event("pixelsnack:fit"))}>适应</button><button onClick={() => window.dispatchEvent(new Event("pixelsnack:100"))}>100%</button></div>
        <div className="panel-foot"><i/> OFFLINE READY</div>
      </aside>

      <section className="editor-stage">
        <div className="stage-topline"><span>EDITORIAL AREA</span><span>X:{project.width} Y:{project.height}</span></div>
        <PixelCanvas onZoom={setZoom} />
        <div className="floating-tools">
          {tools.map((t) => <button key={t.id} className={editor.tool === t.id ? "active" : ""} onClick={() => editor.setTool(t.id)} title={`${t.label} (${t.key})`} aria-label={t.label}><span>{t.icon}</span><small>{t.label}</small></button>)}
          <i/><button onClick={editor.toggleGrid} className={editor.showGrid ? "active" : ""} aria-label="切换网格"><span>▦</span><small>网格</small></button><button onClick={editor.toggleBoards} className={editor.showBoards ? "active" : ""} aria-label="切换分板线"><span>⌗</span><small>分板</small></button>
        </div>
        <div className="stage-status"><span><i className="cyan-dot"/> {tools.find((t) => t.id === editor.tool)?.label}模式</span><span>笔刷 {editor.brushSize}×{editor.brushSize}</span><span>{total.toLocaleString()} 颗拼豆</span></div>
      </section>

      <aside className="right-panel panel">
        <div className="right-tabs"><button className="active">色板</button><button onClick={() => setConvertOpen(true)}>转图</button><button onClick={() => filePalette.current?.click()}>导入</button></div>
        <input ref={filePalette} hidden type="file" accept=".csv,.json" onChange={(e) => handlePalette(e.target.files?.[0])}/>
        <div className="current-color"><span style={{ background: project.palette.find((c) => c.index === editor.color)?.hex }}/><div><small>CURRENT COLOR</small><b>{project.palette.find((c) => c.index === editor.color)?.code}</b></div><em>{usage.get(editor.color) || 0} PCS</em></div>
        <div className="color-search"><span>⌕</span><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="搜索色号 / 名称" /></div>
        <div className="palette-meta"><span>PIXELSNACK DEV SET</span><small>{filtered.length} COLORS</small></div>
        <div className="swatch-grid">{filtered.map((c) => <button key={c.index} className={editor.color === c.index ? "selected" : ""} style={{ background: c.hex }} onClick={() => { editor.setColor(c.index); editor.setTool("pencil"); }} title={`${c.code} · ${c.name} · ${usage.get(c.index) || 0} 颗`} aria-label={`${c.code} ${c.name}`}><span>{c.code.slice(-2)}</span></button>)}</div>
        <div className="brush-control"><div><span>笔刷尺寸</span><b>{editor.brushSize} × {editor.brushSize}</b></div><input type="range" min="1" max="8" value={editor.brushSize} onChange={(e) => editor.setBrushSize(+e.target.value)} /></div>
        <div className="material-summary"><span><small>已用颜色</small><b>{usage.size}</b></span><i/><span><small>拼豆总数</small><b>{total.toLocaleString()}</b></span><i/><span><small>拼豆板</small><b>{Math.ceil(project.width / project.board.width) * Math.ceil(project.height / project.board.height)}</b></span></div>
      </aside>
    </section>

    <nav className="mobile-nav"><button onClick={() => setMobilePanel(mobilePanel === "tools" ? null : "tools")}>✦<small>工具</small></button><button onClick={() => setMobilePanel(mobilePanel === "colors" ? null : "colors")}>◉<small>色板</small></button><button onClick={() => setConvertOpen(true)}>▧<small>转图</small></button><button onClick={() => setExportOpen(true)}>✓<small>导出</small></button></nav>
    {mobilePanel && <div className="mobile-sheet"><div className="sheet-grip"/>{mobilePanel === "tools" ? <div className="mobile-tools">{tools.map((t) => <button key={t.id} className={editor.tool === t.id ? "active" : ""} onClick={() => { editor.setTool(t.id); setMobilePanel(null); }}>{t.icon}<small>{t.label}</small></button>)}</div> : <div className="mobile-colors">{project.palette.map((c) => <button key={c.index} className={editor.color === c.index ? "selected" : ""} style={{ background: c.hex }} onClick={() => { editor.setColor(c.index); editor.setTool("pencil"); setMobilePanel(null); }}/>)}</div>}</div>}

    <div className="quick-create"><button onClick={() => setNewOpen(true)}>＋ 新建</button><button onClick={() => fileProject.current?.click()}>⇧ 导入工程</button><button onClick={() => exportProject(project)}>⇩ 备份工程</button></div>
    <input ref={fileProject} hidden type="file" accept=".pixelsnack" onChange={(e) => handleProject(e.target.files?.[0])}/>
    {notice && <div className="toast" role="status">{notice}</div>}
    <ImageConverter open={convertOpen} onClose={() => setConvertOpen(false)} />
    {newOpen && <NewProjectModal onClose={() => setNewOpen(false)} onCreate={(w, h, name, board) => { const p = createProject(w, h, name); p.board = { width: board, height: board }; editor.replaceProject(p); setNewOpen(false); }} />}
    {exportOpen && <ExportModal project={project} total={total} grid={pngGrid} transparent={pngTransparent} scale={pngScale} setGrid={setPngGrid} setTransparent={setPngTransparent} setScale={setPngScale} onClose={() => setExportOpen(false)} />}
  </main>;
}

type ExportModalProps = { project: ReturnType<typeof createProject>; total: number; grid: boolean; transparent: boolean; scale: number; setGrid: (v: boolean) => void; setTransparent: (v: boolean) => void; setScale: (v: number) => void; onClose: () => void };
function ExportModal({ project, total, grid, transparent, scale, setGrid, setTransparent, setScale, onClose }: ExportModalProps) {
  return <div className="modal-backdrop" role="presentation"><section className="modal export-modal" role="dialog" aria-modal="true"><header><div><span className="eyebrow">OUTPUT BAY / 03</span><h2>完成并导出</h2></div><button className="icon-button" onClick={onClose}>×</button></header><div className="export-cards">
    <article><span className="export-glyph">▦</span><h3>PNG 成品图</h3><p>适合社交分享、继续编辑或制作预览。</p><label>单格像素 <b>{scale}px</b><input type="range" min="1" max="32" value={scale} onChange={(e) => setScale(+e.target.value)} /></label><label className="check"><input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)}/>显示网格</label><label className="check"><input type="checkbox" checked={transparent} onChange={(e) => setTransparent(e.target.checked)}/>透明背景</label><button className="primary wide" onClick={() => exportPng(project, scale, grid, transparent)}>导出 PNG</button></article>
    <article><span className="export-glyph">▤</span><h3>PDF 分板图纸</h3><p>A4 横向分页，包含色号、板块坐标、材料表与校准尺。</p><div className="pdf-facts"><span><small>页面</small><b>{Math.ceil(project.width / project.board.width) * Math.ceil(project.height / project.board.height)}</b></span><span><small>豆数</small><b>{total}</b></span></div><button className="primary wide" onClick={() => exportPdf(project)}>导出 PDF</button></article>
    <article><span className="export-glyph">⬡</span><h3>PixelSnack 工程</h3><p>包含色板快照、二进制画布和预览图，用于备份和迁移。</p><button className="ghost wide" onClick={() => exportProject(project)}>导出 .pixelsnack</button></article>
  </div></section></div>;
}

function NewProjectModal({ onClose, onCreate }: { onClose: () => void; onCreate: (w: number, h: number, name: string, board: number) => void }) {
  const [w, setW] = useState(48), [h, setH] = useState(48), [name, setName] = useState("UNTITLED BEAD 01"), [board, setBoard] = useState(29);
  return <div className="modal-backdrop"><section className="modal small-modal" role="dialog" aria-modal="true"><header><div><span className="eyebrow">NEW GRID / 01</span><h2>新建拼豆作品</h2></div><button className="icon-button" onClick={onClose}>×</button></header><div className="new-form"><label>作品名称<input value={name} onChange={(e) => setName(e.target.value)}/></label><div className="form-row"><label>宽度<input type="number" min="1" max="256" value={w} onChange={(e) => setW(Math.max(1, Math.min(256, +e.target.value)))}/></label><label>高度<input type="number" min="1" max="256" value={h} onChange={(e) => setH(Math.max(1, Math.min(256, +e.target.value)))}/></label></div><label>拼豆板规格<select value={board} onChange={(e) => setBoard(+e.target.value)}><option value="29">29 × 29 标准板</option><option value="16">16 × 16 小板</option><option value="32">32 × 32 大板</option></select></label><div className="new-summary"><span>{w * h}</span> 个网格 · 预计 {Math.ceil(w / board) * Math.ceil(h / board)} 块拼豆板</div></div><footer><button className="ghost" onClick={onClose}>取消</button><button className="primary" onClick={() => onCreate(w, h, name, board)}>创建画布</button></footer></section></div>;
}
