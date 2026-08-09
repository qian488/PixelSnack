"use client";
import { create } from "zustand";
import { CellChange, EditorTool, PixelProject, createDemoProject, floodFill } from "./editor-core";

type HistoryEntry = { label: string; changes: CellChange[] };
type EditorState = {
  project: PixelProject; revision: number; tool: EditorTool; color: number; brushSize: number;
  showGrid: boolean; showBoards: boolean; undoStack: HistoryEntry[]; redoStack: HistoryEntry[];
  setTool: (tool: EditorTool) => void; setColor: (color: number) => void; setBrushSize: (n: number) => void;
  toggleGrid: () => void; toggleBoards: () => void; apply: (changes: CellChange[], label?: string) => void;
  fill: (index: number) => void; undo: () => void; redo: () => void; clear: () => void;
  replaceProject: (project: PixelProject) => void; rename: (name: string) => void;
};

export const useEditor = create<EditorState>((set, get) => ({
  project: createDemoProject(), revision: 0, tool: "pencil", color: 3, brushSize: 1,
  showGrid: true, showBoards: true, undoStack: [], redoStack: [],
  setTool: (tool) => set({ tool }), setColor: (color) => set({ color }), setBrushSize: (brushSize) => set({ brushSize }),
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })), toggleBoards: () => set((s) => ({ showBoards: !s.showBoards })),
  apply: (changes, label = "绘制") => set((s) => {
    const unique = new Map<number, CellChange>();
    for (const c of changes) {
      const existing = unique.get(c.index);
      unique.set(c.index, existing ? { ...existing, after: c.after } : c);
    }
    const valid = [...unique.values()].filter((c) => c.before !== c.after);
    if (!valid.length) return s;
    const cells = s.project.cells.slice(); valid.forEach((c) => { cells[c.index] = c.after; });
    return { project: { ...s.project, cells, updatedAt: new Date().toISOString() }, revision: s.revision + 1,
      undoStack: [...s.undoStack, { label, changes: valid }].slice(-200), redoStack: [] };
  }),
  fill: (index) => { const s = get(); s.apply(floodFill(s.project.cells, s.project.width, s.project.height, index, s.tool === "eraser" ? 0 : s.color), "填充"); },
  undo: () => set((s) => {
    const entry = s.undoStack.at(-1); if (!entry) return s;
    const cells = s.project.cells.slice(); entry.changes.forEach((c) => { cells[c.index] = c.before; });
    return { project: { ...s.project, cells }, revision: s.revision + 1, undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, entry] };
  }),
  redo: () => set((s) => {
    const entry = s.redoStack.at(-1); if (!entry) return s;
    const cells = s.project.cells.slice(); entry.changes.forEach((c) => { cells[c.index] = c.after; });
    return { project: { ...s.project, cells }, revision: s.revision + 1, undoStack: [...s.undoStack, entry], redoStack: s.redoStack.slice(0, -1) };
  }),
  clear: () => { const s = get(); const changes: CellChange[] = []; s.project.cells.forEach((v, i) => { if (v) changes.push({ index: i, before: v, after: 0 }); }); s.apply(changes, "清空画布"); },
  replaceProject: (project) => set((s) => ({ project, revision: s.revision + 1, undoStack: [], redoStack: [], color: project.palette[0]?.index || 1 })),
  rename: (name) => set((s) => ({ project: { ...s.project, name, updatedAt: new Date().toISOString() }, revision: s.revision + 1 })),
}));
