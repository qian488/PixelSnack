import { describe, expect, it } from "vitest";
import { convertPixels } from "../app/image-convert-core";

const palette = [
  { index: 1, rgb: [0, 0, 0] as [number, number, number] },
  { index: 2, rgb: [255, 255, 255] as [number, number, number] },
];

describe("image conversion", () => {
  it("maps opaque pixels to the nearest palette color", () => {
    const cells = convertPixels({
      pixels: new Uint8ClampedArray([8, 12, 10, 255, 245, 250, 248, 255]),
      width: 2, height: 1, palette, dither: false, maxColors: 2,
    });
    expect([...cells]).toEqual([1, 2]);
  });

  it("keeps transparent pixels empty", () => {
    const cells = convertPixels({
      pixels: new Uint8ClampedArray([0, 0, 0, 0]),
      width: 1, height: 1, palette, dither: true, maxColors: 2,
    });
    expect([...cells]).toEqual([0]);
  });

  it("selects the most useful colors from the whole palette instead of its first entries", () => {
    const cells = convertPixels({
      pixels: new Uint8ClampedArray([250, 20, 20, 255, 245, 25, 25, 255, 255, 255, 255, 255]),
      width: 3,
      height: 1,
      palette: [
        { index: 1, rgb: [0, 0, 0] },
        { index: 2, rgb: [255, 255, 255] },
        { index: 3, rgb: [255, 0, 0] },
      ],
      dither: false,
      maxColors: 1,
    });
    expect([...cells]).toEqual([3, 3, 3]);
  });

  it("fails clearly when no palette color is available", () => {
    expect(() => convertPixels({
      pixels: new Uint8ClampedArray([0, 0, 0, 255]),
      width: 1, height: 1, palette, dither: false, maxColors: 0,
    })).toThrow("当前色板没有可用颜色");
  });
});
