"use client";
import { useEffect, useRef, useState } from "react";
import { createProject } from "./editor-core";
import { useEditor } from "./editor-store";

export function ImageConverter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const palette = useEditor((s) => s.project.palette); const replace = useEditor((s) => s.replaceProject);
  const [file, setFile] = useState<File | null>(null); const [width, setWidth] = useState(48); const [height, setHeight] = useState(48);
  const [maxColors, setMaxColors] = useState(24); const [dither, setDither] = useState(false); const [busy, setBusy] = useState(false); const [result, setResult] = useState<Uint16Array | null>(null);
  const preview = useRef<HTMLCanvasElement>(null); const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);
  useEffect(() => {
    if (!result || !preview.current) return; const c = preview.current; const scale = Math.max(2, Math.floor(280 / Math.max(width, height))); c.width = width * scale; c.height = height * scale; const ctx = c.getContext("2d")!; ctx.fillStyle = "#f5f1e8"; ctx.fillRect(0, 0, c.width, c.height); const colors = new Map(palette.map((x) => [x.index, x.hex])); result.forEach((v, i) => { if (!v) return; ctx.fillStyle = colors.get(v)!; ctx.fillRect((i % width) * scale, Math.floor(i / width) * scale, scale, scale); });
  }, [result, width, height, palette]);
  if (!open) return null;
  const convert = async () => {
    if (!file) return; setBusy(true); setResult(null);
    try {
      const bitmap = await createImageBitmap(file); const c = document.createElement("canvas"); c.width = width; c.height = height; const ctx = c.getContext("2d")!; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(bitmap, 0, 0, width, height); bitmap.close();
      const image = ctx.getImageData(0, 0, width, height); worker.current?.terminate();
      const w = new Worker(new URL("./image-worker.ts", import.meta.url), { type: "module" }); worker.current = w;
      const cells = await new Promise<Uint16Array>((resolve, reject) => { w.onmessage = (e) => resolve(new Uint16Array(e.data.cells)); w.onerror = () => reject(new Error("转换线程失败")); w.postMessage({ pixels: image.data, width, height, palette: palette.map(({ index, rgb }) => ({ index, rgb })), dither, maxColors }, [image.data.buffer]); });
      setResult(cells);
    } catch (e) { alert(e instanceof Error ? e.message : "图片转换失败"); } finally { setBusy(false); }
  };
  const confirm = () => { if (!result) return; const p = createProject(width, height, file?.name.replace(/\.[^.]+$/, "") || "IMAGE STUDY"); p.cells = result; p.palette = palette.map((c) => ({ ...c })); replace(p); onClose(); };
  return <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="modal converter" role="dialog" aria-modal="true" aria-labelledby="convert-title">
      <header><div><span className="eyebrow">LOCAL PROCESSING / 02</span><h2 id="convert-title">图片转拼豆</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭">×</button></header>
      <div className="convert-layout"><div className="convert-form">
        <label className="upload-zone"><input type="file" accept="image/*" onChange={(e) => { setFile(e.target.files?.[0] || null); setResult(null); }} /><span className="upload-icon">＋</span><strong>{file?.name || "选择本地图片"}</strong><small>图片只在当前设备处理，不会上传</small></label>
        <div className="form-row"><label>宽度<input type="number" min="8" max="256" value={width} onChange={(e) => setWidth(Math.max(8, Math.min(256, +e.target.value)))} /></label><label>高度<input type="number" min="8" max="256" value={height} onChange={(e) => setHeight(Math.max(8, Math.min(256, +e.target.value)))} /></label></div>
        <label>最大颜色数 <b>{maxColors}</b><input type="range" min="4" max={palette.length} value={maxColors} onChange={(e) => setMaxColors(+e.target.value)} /></label>
        <label className="switch-row"><span><strong>误差扩散抖动</strong><small>适合渐变照片，纯色插画建议关闭</small></span><input aria-label="误差扩散抖动" type="checkbox" checked={dither} onChange={(e) => setDither(e.target.checked)} /></label>
        <button className="primary wide" disabled={!file || busy} onClick={convert}>{busy ? "正在匹配 OKLab 色彩…" : "生成预览"}</button>
      </div><div className="convert-preview">{result ? <canvas ref={preview} /> : <div className="preview-empty"><span>▦</span><p>转换结果将在这里预览</p></div>}</div></div>
      <footer><button className="ghost" onClick={onClose}>取消</button><button className="primary" disabled={!result} onClick={confirm}>创建为新作品</button></footer>
    </section>
  </div>;
}
