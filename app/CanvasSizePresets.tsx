"use client";
import { CANVAS_SIZE_PRESETS } from "./editor-core";

export function CanvasSizePresets({ width, height, onSelect }: { width: number; height: number; onSelect: (size: number) => void }) {
  return <div className="size-presets" aria-label="常用画布尺寸">
    {CANVAS_SIZE_PRESETS.map((size) => <button key={size} type="button" className={width === size && height === size ? "active" : ""} onClick={() => onSelect(size)}>{size}×{size}</button>)}
  </div>;
}
