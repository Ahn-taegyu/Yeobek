import type { PublicArtworkLabel } from "./contracts";

const normalize = (text: string) => text.normalize("NFKC").toLocaleLowerCase("ko").replace(/\s+/gu, " ").trim();
const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Only current public titles, with word/particle boundaries; never fuzzy guess. */
export function mentionedArtworks(question: string, labels: PublicArtworkLabel[]) {
  const text = normalize(question);
  const matches: { label: PublicArtworkLabel; start: number; end: number }[] = [];
  for (const label of labels) {
    const title = normalize(label.title);
    if (!title) continue;
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(title)}(?=$|[\\s.,!?"'“”‘’「」<>]|(?:은|는|을|를|의|에서|에|으로|과|와|도)(?=$|[\\s.,!?]))`, "gu");
    for (const match of text.matchAll(pattern)) {
      const start = match.index, end = start + match[0].length;
      // One-character titles require an explicit title cue or exact standalone input.
      if ([...title].length === 1 && text !== title &&
          !/(?:작품\s*|["'“‘「<])$/u.test(text.slice(0, start))) continue;
      matches.push({ label, start, end });
    }
  }
  const longest = matches.filter(a => !matches.some(b => b.start <= a.start && b.end >= a.end && b.end - b.start > a.end - a.start));
  const unique = [...new Map(longest.map(item => [item.label.id, item.label])).values()];
  const explicitTitles = [...text.matchAll(/작품\s*["'“‘「<]([^"'”’」>]+)["'”’」>]/gu)].map(match => normalize(match[1]));
  const explicitUnknown = explicitTitles.some(title => !labels.some(label => normalize(label.title) === title));
  return { matches: unique, explicitUnknown };
}
