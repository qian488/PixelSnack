import { describe, expect, it } from "vitest";
import { createProject, fillGuideRegion, floodFill, lineCells, parsePalette } from "../app/editor-core";

describe("grid algorithms", () => {
  it("interpolates every cell in a fast diagonal stroke", () => {
    expect(lineCells(0, 0, 5, 3)).toEqual([[0,0],[1,1],[2,1],[3,2],[4,2],[5,3]]);
  });

  it("fills only the connected region", () => {
    const cells = new Uint16Array([1,1,0,1,2,0,0,0,0]);
    const changes = floodFill(cells, 3, 3, 0, 3);
    expect(changes.map((c) => c.index).sort((a,b) => a-b)).toEqual([0,1,3]);
    expect(changes.every((c) => c.before === 1 && c.after === 3)).toBe(true);
  });

  it("creates a bounded 256 square project", () => {
    const project = createProject(256, 256, "stress");
    expect(project.cells).toBeInstanceOf(Uint16Array);
    expect(project.cells.length).toBe(65536);
    expect(project.schemaVersion).toBe(1);
  });

  it("fills only one connected guide-color region", () => {
    const project = createProject(3, 3, "guide");
    project.guideCells = new Uint16Array([1, 1, 2, 1, 2, 2, 0, 2, 1]);
    const changes = fillGuideRegion(project, 0, 4);
    expect(changes.map((change) => change.index).sort((a, b) => a - b)).toEqual([0, 1, 3]);
    expect(changes.every((change) => change.before === 0 && change.after === 4)).toBe(true);
  });
});

describe("palette interface", () => {
  it("imports the documented CSV columns", () => {
    const palette = parsePalette("brand,code,name,hex\nAcme,A01,Black,#101010", "colors.csv");
    expect(palette[0]).toMatchObject({ brand: "Acme", code: "A01", name: "Black", hex: "#101010", rgb: [16,16,16] });
  });

  it("rejects malformed colors", () => {
    expect(() => parsePalette('[{"brand":"A","code":"1","name":"bad","hex":"red"}]', "colors.json")).toThrow(/格式不正确/);
  });
});
