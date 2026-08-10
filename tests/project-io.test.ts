import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createProject } from "../app/editor-core";
import { createProjectArchive, createProjectRaster, importProjectArchive } from "../app/project-io";

describe("project files and raster export", () => {
  it("round-trips cells, guide, palette, dimensions and board settings", async () => {
    const project = createProject(24, 16, "ROUND TRIP"); project.board = { width: 29, height: 29 };
    project.cells[0] = 3; project.cells[project.cells.length - 1] = 9;
    project.guideCells = new Uint16Array(project.cells.length); project.guideCells[17] = 5;
    const preview = new Uint8Array([137, 80, 78, 71]);
    const archive = await createProjectArchive(project, preview);
    const zip = await JSZip.loadAsync(archive);
    expect(zip.file("manifest.json")).not.toBeNull(); expect(zip.file("cells.bin")).not.toBeNull(); expect(zip.file("guide.bin")).not.toBeNull();
    expect(await zip.file("preview.png")!.async("uint8array")).toEqual(preview);
    const restored = await importProjectArchive(archive);
    expect(restored.id).not.toBe(project.id); expect(restored.name).toBe(project.name);
    expect([restored.width, restored.height]).toEqual([24, 16]); expect(restored.board).toEqual(project.board); expect(restored.palette).toEqual(project.palette);
    expect([...restored.cells]).toEqual([...project.cells]); expect([...(restored.guideCells || [])]).toEqual([...project.guideCells]);
  });

  it("rejects archives with an invalid cells length", async () => {
    const archive = await createProjectArchive(createProject(24, 24, "BROKEN"));
    const zip = await JSZip.loadAsync(archive); zip.file("cells.bin", new Uint8Array([1, 2]));
    await expect(importProjectArchive(await zip.generateAsync({ type: "uint8array" }))).rejects.toThrow("画布数据长度不正确");
  });

  it("rejects missing files, invalid boards and invalid guide lengths", async () => {
    const missing = new JSZip(); missing.file("manifest.json", "{}");
    await expect(importProjectArchive(await missing.generateAsync({ type: "uint8array" }))).rejects.toThrow("工程包缺少");

    const project = createProject(24, 24, "INVALID");
    const invalidBoard = await JSZip.loadAsync(await createProjectArchive(project));
    const manifest = JSON.parse(await invalidBoard.file("manifest.json")!.async("string")); manifest.board = { width: 0, height: 29 };
    invalidBoard.file("manifest.json", JSON.stringify(manifest));
    await expect(importProjectArchive(await invalidBoard.generateAsync({ type: "uint8array" }))).rejects.toThrow("拼豆板规格不正确");

    project.guideCells = new Uint16Array(project.cells.length);
    const invalidGuide = await JSZip.loadAsync(await createProjectArchive(project)); invalidGuide.file("guide.bin", new Uint8Array([1, 2]));
    await expect(importProjectArchive(await invalidGuide.generateAsync({ type: "uint8array" }))).rejects.toThrow("参考底图数据长度不正确");
  });

  it("creates crisp scaled color pixels and preserves transparent blanks", () => {
    const project = createProject(2, 1, "PNG"); project.cells[0] = 3;
    const raster = createProjectRaster(project, 2, true);
    expect([raster.width, raster.height]).toEqual([4, 2]);
    expect([...raster.data.slice(0, 4)]).toEqual([...project.palette[2].rgb, 255]); expect([...raster.data.slice(4, 8)]).toEqual([...project.palette[2].rgb, 255]);
    expect([...raster.data.slice(8, 12)]).toEqual([0, 0, 0, 0]);
  });

  it("uses the warm opaque background for non-transparent PNG output", () => {
    expect([...createProjectRaster(createProject(1, 1, "PNG"), 1, false).data]).toEqual([247, 244, 235, 255]);
  });
});
