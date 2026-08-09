"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createProject } from "./editor-core";
import { useEditor } from "./editor-store";
import { convertPixels } from "./image-convert-core";

type Crop = { x: number; y: number };
type FitMode = "cover" | "contain";
type ResizeMode = "nearest" | "smooth" | "high";
type OutputMode = "guide" | "filled";

export function cropRect(iw: number, ih: number, ratio: number, zoom: number, crop: Crop) {
  const sourceRatio = iw / ih;
  const baseW = sourceRatio > ratio ? ih * ratio : iw;
  const baseH = sourceRatio > ratio ? ih : iw / ratio;
  const sw = baseW / zoom, sh = baseH / zoom;
  const sx = Math.max(0, Math.min(iw - sw, (iw - sw) * (crop.x + 1) / 2));
  const sy = Math.max(0, Math.min(ih - sh, (ih - sh) * (crop.y + 1) / 2));
  return { sx, sy, sw, sh };
}

function drawSource(ctx: CanvasRenderingContext2D, img: HTMLImageElement, width: number, height: number, mode: FitMode, zoom: number, crop: Crop, resizeMode: ResizeMode = "high") {
  ctx.clearRect(0, 0, width, height);
  if (resizeMode === "high" && width <= 512 && height <= 512) {
    const intermediate = document.createElement("canvas"); intermediate.width = width * 2; intermediate.height = height * 2;
    drawSource(intermediate.getContext("2d")!, img, intermediate.width, intermediate.height, mode, zoom, crop, "smooth");
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    ctx.drawImage(intermediate, 0, 0, width, height);
    return;
  }
  ctx.imageSmoothingEnabled = resizeMode !== "nearest";
  ctx.imageSmoothingQuality = resizeMode === "high" ? "high" : "low";
  if (mode === "cover") {
    const r = cropRect(img.naturalWidth, img.naturalHeight, width / height, zoom, crop);
    ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, width, height);
  } else {
    const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
    const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale;
    ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
  }
}

export function ImageConverter({ open, onClose }: { open: boolean; onClose: () => void }) {
  const palette = useEditor((s) => s.project.palette); const replace = useEditor((s) => s.replaceProject);
  const [file, setFile] = useState<File | null>(null); const [sourceUrl, setSourceUrl] = useState(""); const [sourceVersion, setSourceVersion] = useState(0); const [sourceSize, setSourceSize] = useState({ width: 0, height: 0 });
  const [width, setWidth] = useState(48); const [height, setHeight] = useState(48); const [maxColors, setMaxColors] = useState(18);
  const [dither, setDither] = useState(false); const [fitMode, setFitMode] = useState<FitMode>("cover"); const [zoom, setZoom] = useState(1); const [crop, setCrop] = useState<Crop>({ x: 0, y: 0 });
  const [resizeMode, setResizeMode] = useState<ResizeMode>("high"); const [outputMode, setOutputMode] = useState<OutputMode>("guide");
  const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(0); const [result, setResult] = useState<Uint16Array | null>(null); const [error, setError] = useState("");
  const sourceImage = useRef<HTMLImageElement | null>(null); const cropCanvas = useRef<HTMLCanvasElement>(null); const resultCanvas = useRef<HTMLCanvasElement>(null);
  const worker = useRef<Worker | null>(null); const cancelTask = useRef<(() => void) | null>(null);
  const drag = useRef<{ px: number; py: number; crop: Crop } | null>(null); const fileInput = useRef<HTMLInputElement>(null);

  const previewSize = useMemo(() => {
    const max = 680, ratio = width / height;
    return ratio >= 1 ? { w: max, h: Math.max(80, Math.round(max / ratio)) } : { w: Math.max(80, Math.round(max * ratio)), h: max };
  }, [width, height]);

  const paintCrop = useCallback(() => {
    const canvas = cropCanvas.current, img = sourceImage.current; if (!canvas || !img) return;
    canvas.width = previewSize.w; canvas.height = previewSize.h;
    const ctx = canvas.getContext("2d")!;
    drawSource(ctx, img, canvas.width, canvas.height, fitMode, zoom, crop, resizeMode);
  }, [previewSize, fitMode, zoom, crop, resizeMode]);

  useEffect(() => { paintCrop(); }, [paintCrop, sourceVersion]);
  useEffect(() => () => { cancelTask.current?.(); worker.current?.terminate(); }, []);
  useEffect(() => () => { if (sourceUrl) URL.revokeObjectURL(sourceUrl); }, [sourceUrl]);
  useEffect(() => {
    if (!result || !resultCanvas.current) return;
    const c = resultCanvas.current; const scale = Math.max(2, Math.min(10, Math.floor(360 / Math.max(width, height)))); c.width = width * scale; c.height = height * scale;
    const ctx = c.getContext("2d")!; ctx.fillStyle = "#fffaf7"; ctx.fillRect(0, 0, c.width, c.height); const colors = new Map(palette.map((x) => [x.index, x.hex]));
    ctx.globalAlpha = outputMode === "guide" ? .3 : 1;
    result.forEach((v, i) => { if (!v) return; ctx.fillStyle = colors.get(v)!; ctx.fillRect((i % width) * scale, Math.floor(i / width) * scale, scale, scale); });
    ctx.globalAlpha = 1;
  }, [result, width, height, palette, outputMode]);

  if (!open) return null;

  const chooseFile = (next?: File) => {
    if (!next) return; if (!next.type.startsWith("image/")) { setError("请选择 PNG、JPG 或 WebP 图片"); return; }
    const url = URL.createObjectURL(next); const img = new Image();
    img.onload = () => { sourceImage.current = img; setSourceSize({ width: img.naturalWidth, height: img.naturalHeight }); setSourceVersion((n) => n + 1); setError(""); };
    img.onerror = () => setError("图片读取失败，请换一张图片重试"); img.src = url;
    setFile(next); setSourceUrl(url); setCrop({ x: 0, y: 0 }); setZoom(1); setResult(null);
  };

  const convert = async () => {
    const img = sourceImage.current; if (!file || !img) return; setBusy(true); setProgress(0); setResult(null); setError("");
    try {
      const c = document.createElement("canvas"); c.width = width; c.height = height; const ctx = c.getContext("2d")!;
      drawSource(ctx, img, width, height, fitMode, zoom, crop, resizeMode);
      const image = ctx.getImageData(0, 0, width, height);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const input = { pixels: image.data, width, height, palette: palette.map(({ index, rgb }) => ({ index, rgb })), dither, maxColors };
      let cells: Uint16Array;
      if (typeof Worker === "undefined") cells = convertPixels(input);
      else {
        const transferPixels = image.data.slice();
        try {
          cells = await new Promise<Uint16Array>((resolve, reject) => {
            const active = new Worker("/image-worker.js"); worker.current = active;
            cancelTask.current = () => { active.terminate(); reject(new DOMException("转换已取消", "AbortError")); };
            active.onmessage = (event) => { const message = event.data; if (message.type === "progress") setProgress(message.value); else if (message.type === "result") resolve(new Uint16Array(message.cells)); else if (message.type === "error") reject(new Error(message.message)); };
            active.onerror = () => reject(new Error("转换线程加载失败"));
            active.postMessage({ ...input, pixels: transferPixels }, [transferPixels.buffer]);
          });
        } catch (workerError) {
          if (workerError instanceof DOMException && workerError.name === "AbortError") throw workerError;
          cells = convertPixels(input);
        }
      }
      setResult(cells);
      setProgress(100);
    } catch (e) { if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "图片转换失败"); } finally { worker.current?.terminate(); worker.current = null; cancelTask.current = null; setBusy(false); }
  };

  const confirm = () => { if (!result) return; const p = createProject(width, height, file?.name.replace(/\.[^.]+$/, "") || "图片拼豆"); if (outputMode === "guide") p.guideCells = result.slice(); else p.cells = result.slice(); p.palette = palette.map((c) => ({ ...c })); replace(p); onClose(); };
  const pointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => { if (fitMode !== "cover") return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { px: e.clientX, py: e.clientY, crop }; };
  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!drag.current) return; const rect = e.currentTarget.getBoundingClientRect(); setCrop({ x: Math.max(-1, Math.min(1, drag.current.crop.x - (e.clientX - drag.current.px) / rect.width * 2)), y: Math.max(-1, Math.min(1, drag.current.crop.y - (e.clientY - drag.current.py) / rect.height * 2)) }); };
  const pointerUp = () => { drag.current = null; };
  const close = () => { cancelTask.current?.(); onClose(); };

  return <div className="modal-backdrop soft-backdrop" role="presentation">
    <section className="modal converter crop-modal" role="dialog" aria-modal="true" aria-labelledby="convert-title">
      <header><div><span className="eyebrow">IMAGE TO BEADS</span><h2 id="convert-title">图片转拼豆</h2><p>上传喜欢的图片，裁出最合适的画面，再映射到拼豆色板。</p></div><button className="icon-button" onClick={close} aria-label="关闭">×</button></header>
      <div className="crop-layout">
        <div className="crop-stage">
          {!sourceUrl ? <button className="image-dropzone" onClick={() => fileInput.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); chooseFile(e.dataTransfer.files[0]); }}>
            <span className="drop-illustration">♡</span><strong>上传一张普通图片</strong><small>点击选择，或把 PNG / JPG / WebP 拖到这里</small><em>所有处理都只在你的设备上完成</em>
          </button> : <>
            <div className="crop-canvas-shell"><canvas ref={cropCanvas} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} aria-label="图片裁切预览"/><div className="crop-grid"/><span className="crop-tip">拖动图片调整位置</span></div>
            <div className="crop-file-row"><span><b>{file?.name}</b><small>{sourceSize.width} × {sourceSize.height}</small></span><button onClick={() => fileInput.current?.click()}>更换图片</button></div>
          </>}
          <input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => chooseFile(e.target.files?.[0])}/>
          {result && <div className="conversion-result"><div><span>{outputMode === "guide" ? "浅色参考底图预览" : "完整像素图预览"}</span><small>{width} × {height} · {new Set(result).size} 种颜色</small></div><canvas ref={resultCanvas}/></div>}
        </div>
        <div className="crop-settings">
          <div className="setting-title"><span>01</span><div><b>画布尺寸</b><small>最多支持 256 × 256</small></div></div>
          <div className="form-row"><label>宽度<input type="number" min="8" max="256" value={width} onChange={(e) => { setWidth(Math.max(8, Math.min(256, +e.target.value))); setResult(null); }} /></label><label>高度<input type="number" min="8" max="256" value={height} onChange={(e) => { setHeight(Math.max(8, Math.min(256, +e.target.value))); setResult(null); }} /></label></div>
          <div className="setting-title"><span>02</span><div><b>裁切方式</b><small>裁切模式支持拖动和缩放</small></div></div>
          <div className="soft-segment"><button className={fitMode === "cover" ? "active" : ""} onClick={() => { setFitMode("cover"); setResult(null); }}>裁切填满</button><button className={fitMode === "contain" ? "active" : ""} onClick={() => { setFitMode("contain"); setResult(null); }}>完整保留</button></div>
          <label className={fitMode === "contain" ? "range-label disabled" : "range-label"}><span>图片缩放 <b>{zoom.toFixed(1)}×</b></span><input disabled={fitMode === "contain"} type="range" min="1" max="4" step="0.1" value={zoom} onChange={(e) => { setZoom(+e.target.value); setResult(null); }}/></label>
          <label className="algorithm-select">缩放算法<select value={resizeMode} onChange={(e) => { setResizeMode(e.target.value as ResizeMode); setResult(null); }}><option value="nearest">最近邻（像素画 / 图标）</option><option value="smooth">平滑缩放（普通插画）</option><option value="high">高质量平滑（照片，推荐）</option></select><small>算法会影响缩小后的边缘与细节，再进行 OKLab 色板匹配。</small></label>
          <div className="setting-title"><span>03</span><div><b>颜色处理</b><small>匹配当前拼豆色板</small></div></div>
          <label className="range-label"><span>最大颜色数 <b>{maxColors}</b></span><input type="range" min="4" max={palette.length} value={maxColors} onChange={(e) => { setMaxColors(+e.target.value); setResult(null); }}/></label>
          <label className="pastel-switch"><span><b>柔化渐变（抖动）</b><small>照片建议开启，插画建议关闭</small></span><input aria-label="柔化渐变" type="checkbox" checked={dither} onChange={(e) => { setDither(e.target.checked); setResult(null); }}/></label>
          <div className="setting-title"><span>04</span><div><b>创建方式</b><small>先体验拼豆，或直接获得像素图</small></div></div>
          <div className="soft-segment output-segment"><button className={outputMode === "guide" ? "active" : ""} onClick={() => setOutputMode("guide")}><b>互动描摹</b><small>浅色底图，自己填豆</small></button><button className={outputMode === "filled" ? "active" : ""} onClick={() => setOutputMode("filled")}><b>直接生成</b><small>获得完整像素图</small></button></div>
          {error && <p className="form-error">{error}</p>}
          {busy && <div className="conversion-progress" aria-live="polite"><span><b>正在生成拼豆预览</b><em>{progress}%</em></span><i><b style={{ width: `${progress}%` }}/></i></div>}
          <div className="conversion-actions"><button className="primary wide convert-action" disabled={!file || busy} onClick={convert}>{result ? "重新生成预览" : "生成拼豆预览"}</button>{busy && <button className="ghost cancel-conversion" onClick={() => cancelTask.current?.()}>取消转换</button>}</div>
        </div>
      </div>
      <footer><span>{outputMode === "guide" ? "参考图会淡化显示在可编辑画布底部" : "你的原作品不会被覆盖"}</span><div><button className="ghost" onClick={close}>取消</button><button className="primary" disabled={!result} onClick={confirm}>{outputMode === "guide" ? "开始拼豆" : "创建像素图"}</button></div></footer>
    </section>
  </div>;
}
