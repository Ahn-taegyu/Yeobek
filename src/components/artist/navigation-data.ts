import { requestApi } from "@/lib/client";
import { loadArtistPage } from "@/lib/client/artist-navigation";

export const profileKey = "profile";
export const homeKey = "home";
export const exhibitionKey = (id: string) => `exhibition:${id}`;
export const materialsKey = (id: string) => `exhibition-materials:${id}`;
export const overviewKey = (id: string) => `exhibition-overview:${id}`;
export const artworkListKey = (id: string) => `artworks:${id}`;

export async function loadProfile(signal: AbortSignal) {
  return (await requestApi("getProfile", { signal })).data;
}

export async function loadHome(signal: AbortSignal) {
  const [profile, exhibitions] = await Promise.all([
    loadArtistPage(profileKey, loadProfile, signal), requestApi("listExhibitions", { signal }),
  ]);
  return { profile, ...exhibitions.data };
}

export async function loadExhibition(id: string, signal: AbortSignal) {
  return (await requestApi("getExhibition", { params: { id }, signal })).data;
}

export async function loadArtworkList(id: string, signal: AbortSignal) {
  return (await requestApi("listArtworks", { params: { id }, signal })).data.items;
}

export async function loadExhibitionMaterials(id: string, signal: AbortSignal) {
  const [works, materials] = await Promise.all([
    loadArtistPage(artworkListKey(id), signal => loadArtworkList(id, signal), signal),
    requestApi("listMaterials", { query: { subjectType: "exhibition", subjectId: id }, signal }),
  ]);
  return { works, materials: materials.data };
}

export async function loadExhibitionOverview(id: string, signal: AbortSignal) {
  const [exhibition, works] = await Promise.all([
    loadArtistPage(exhibitionKey(id), signal => loadExhibition(id, signal), signal),
    loadArtistPage(artworkListKey(id), signal => loadArtworkList(id, signal), signal),
  ]);
  return { exhibition, works };
}

export async function prepareExhibition(id: string) {
  const exhibition = await loadArtistPage(exhibitionKey(id), signal => loadExhibition(id, signal));
  if (exhibition.state !== "draft" || exhibition.authoringStep === "artworks") {
    await loadArtistPage(materialsKey(id), signal => loadExhibitionMaterials(id, signal));
  }
}
