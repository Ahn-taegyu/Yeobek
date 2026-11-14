import { describe, expect, it } from "vitest";
import { mediaQuery } from "@/lib/contracts/media";

describe("public media width", () => {
  it("keeps the original file when no width is given", () => {
    expect(mediaQuery.parse({ kind: "image" })).toEqual({ kind: "image" });
  });
  it("accepts only the fixed display widths for images and posters", () => {
    expect(mediaQuery.parse({ kind: "image", w: "320" })).toEqual({ kind: "image", w: "320" });
    expect(mediaQuery.parse({ kind: "poster", w: "640" })).toEqual({ kind: "poster", w: "640" });
    for (const w of ["100", "4000", "320px", ""]) expect(mediaQuery.safeParse({ kind: "image", w }).success).toBe(false);
  });
  it("rejects a width for audio", () => {
    expect(mediaQuery.safeParse({ kind: "audio", w: "320" }).success).toBe(false);
  });
});
