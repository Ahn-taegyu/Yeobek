import { afterEach, describe, expect, it, vi } from "vitest";
import PreviewPage from "@/app/artist/exhibitions/[id]/preview/page";
import { AuthorPreviewExperience } from "@/components/artist/author-preview-experience";
import { Preview } from "@/components/artist/review";
vi.mock("server-only", () => ({}));
vi.mock("@/components/artist/author-preview-experience", () => ({ AuthorPreviewExperience: () => null }));
vi.mock("@/components/artist/review", () => ({ Preview: () => null }));
afterEach(() => vi.unstubAllEnvs());
const page = (qa?: string) => PreviewPage({ params: Promise.resolve({ id: "exhibition" }), searchParams: Promise.resolve({ work: "artwork", qa }) });
describe("author preview page gate", () => {
  it("keeps the existing preview while the new experience is disabled", async () => {
    vi.stubEnv("FEATURE_PREVIEW_EXPERIENCE", "false");
    vi.stubEnv("FEATURE_PREVIEW_CHAT", "true");
    expect((await page()).type).toBe(Preview);
  });
  it("opens the private experience only when both flags are enabled", async () => {
    vi.stubEnv("FEATURE_PREVIEW_EXPERIENCE", "true");
    vi.stubEnv("FEATURE_PREVIEW_CHAT", "true");
    const result = await page();
    expect(result.type).toBe(AuthorPreviewExperience);
    expect(result.props).toMatchObject({ id: "exhibition", initialArtworkId: "artwork" });
    vi.stubEnv("FEATURE_PREVIEW_CHAT", "false");
    expect((await page()).type).toBe(Preview);
  });
  it("preserves the question-specific editor even when the experience is enabled", async () => {
    vi.stubEnv("FEATURE_PREVIEW_EXPERIENCE", "true");
    vi.stubEnv("FEATURE_PREVIEW_CHAT", "true");
    const result = await page("question");
    expect(result.type).toBe(Preview);
    expect(result.props).toMatchObject({ qaId: "question" });
  });
});
