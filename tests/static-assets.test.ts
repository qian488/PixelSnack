import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("offline application assets", () => {
  it("ships the conversion worker and caches it for offline use", async () => {
    const worker = await readFile("public/image-worker.js", "utf8");
    const serviceWorker = await readFile("public/sw.js", "utf8");
    expect(worker).toContain("self.onmessage");
    expect(serviceWorker).toContain("/image-worker.js");
  });

  it("ships an installable PWA manifest", async () => {
    const manifest = JSON.parse(await readFile("public/manifest.webmanifest", "utf8"));
    expect(manifest.name).toContain("PixelSnack");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.length).toBeGreaterThan(0);
  });
});
