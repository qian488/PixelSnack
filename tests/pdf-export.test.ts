import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { createDemoProject } from "../app/editor-core";
import { createPdfBytes, expectedPdfPageCount, millimetersToPoints } from "../app/pdf-export";

describe("PDF pattern export", () => {
  it("creates an overview followed by one page per physical board", async () => {
    const project = createDemoProject();
    const bytes = await createPdfBytes(project, { contentMode: "progress" });
    const pdf = await PDFDocument.load(bytes);

    expect(expectedPdfPageCount(project, "progress")).toBe(5);
    expect(pdf.getPageCount()).toBe(5);
    for (const page of pdf.getPages()) {
      expect(page.getWidth()).toBeCloseTo(841.89, 1);
      expect(page.getHeight()).toBeCloseTo(595.28, 1);
    }
  });

  it("uses the complete guide as the default pattern source", async () => {
    const project = createDemoProject();
    project.guideCells = project.cells.slice();
    project.cells.fill(0);

    expect(expectedPdfPageCount(project)).toBe(5);
    const bytes = await createPdfBytes(project);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(5);
  });

  it("adds a materials appendix when the overview legend would overflow", async () => {
    const project = createDemoProject();
    project.cells.fill(0);
    project.palette.forEach((color, index) => { project.cells[index] = color.index; });

    expect(expectedPdfPageCount(project, "progress")).toBe(6);
    const bytes = await createPdfBytes(project, { contentMode: "progress" });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(6);
  });

  it("converts the print calibration rule to real PDF points", () => {
    expect(millimetersToPoints(100)).toBeCloseTo(283.4646, 3);
  });

  it("keeps Unicode project names in document metadata", async () => {
    const project = createDemoProject();
    project.name = "星空猫咪";
    const bytes = await createPdfBytes(project);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toBe("星空猫咪");
  });
});
