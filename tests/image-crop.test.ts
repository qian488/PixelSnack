import { describe, expect, it } from "vitest";
import { cropRect } from "../app/ImageConverter";

describe("image crop geometry", () => {
  it("centers a wide image into a square crop", () => {
    expect(cropRect(1000, 500, 1, 1, { x: 0, y: 0 })).toEqual({ sx: 250, sy: 0, sw: 500, sh: 500 });
  });

  it("supports zoom and edge positioning without leaving the image", () => {
    expect(cropRect(1000, 500, 1, 2, { x: -1, y: 1 })).toEqual({ sx: 0, sy: 250, sw: 250, sh: 250 });
    expect(cropRect(1000, 500, 1, 2, { x: 1, y: -1 })).toEqual({ sx: 750, sy: 0, sw: 250, sh: 250 });
  });
});
