/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const asset = (name: string) => readFileSync(new URL(`../../public/${name}`, import.meta.url));

function paths(svg: string): string[] {
  return Array.from(svg.matchAll(/<path\s+d="([^"]+)"/g), (match) => match[1]!.trim());
}

describe("app branding", () => {
  it("keeps the editable artwork in a padded, square favicon", () => {
    const favicon = asset("favicon.svg").toString();
    expect(favicon).toContain('width="32" height="32"');
    expect(favicon).toContain('viewBox="-50 -10 194 194"');
    // The favicon can be customized independently of the original example.
    expect(paths(favicon).length).toBeGreaterThan(0);
  });

  it.each([
    ["icons/icon-192.png", 192],
    ["icons/icon-512.png", 512],
    ["icons/icon-512-maskable.png", 512],
  ])("exports %s at the expected square dimensions", (name, size) => {
    const png = asset(name);
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  });
});
