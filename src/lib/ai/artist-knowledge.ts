import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { section, sourceRef } from "../api/schemas";
import { assertNotCancelled, textHash } from "./context";
import { codepoints } from "./contracts";
import { assertPlaybookToolConfigured, PLUGIN_VERSION, playbookPrompt } from "./plugin";
import type { AiTextProvider } from "./providers/types";

const uuid = z.uuid();
const revision = z.number().int().positive().max(2147483647);
const subject = z.enum(["artist", "exhibition", "artwork"]);
const sectionIds = { artist: ["bio", "practice"], exhibition: ["introduction", "theme"], artwork: ["description", "notes"] } as const;
const sourceSchema = z.strictObject({ id: uuid, ownerId: uuid, artistId: uuid, subjectType: subject, subjectId: uuid,
  exhibitionId: uuid.nullable(), revision, text: z.string().min(1).refine(v => codepoints(v) <= 5000 && !v.includes("\u0000")), ref: sourceRef });
const contextSchema = z.strictObject({ documentId: uuid, ownerId: uuid, artistId: uuid, subjectId: uuid,
  subjectType: subject, exhibitionId: uuid.nullable(), revision,
  sections: z.array(section).max(2), sourceRefs: z.array(sourceRef).max(24), sources: z.array(sourceSchema).max(12) });
export type ArtistKnowledgeContext = z.infer<typeof contextSchema>;
const selectionSchema = z.strictObject({ sections: z.array(z.strictObject({
  id: section.shape.id, sourceIds: z.array(uuid).min(1).max(12),
})).max(2) });
export const organizationJsonSchema = { name: "yeobek_knowledge_organization", definition: {
  type: "object", additionalProperties: false, required: ["sections"], properties: { sections: { type: "array", items: {
    type: "object", additionalProperties: false, required: ["id", "sourceIds"], properties: {
      id: { type: "string", enum: ["bio", "practice", "introduction", "theme", "description", "notes"] },
      sourceIds: { type: "array", items: { type: "string" } },
    },
  } } },
} };
const pinSchema = z.strictObject({ id: uuid, revision, hash: z.string().regex(/^[a-f0-9]{64}$/) });
const proposalSchema = z.strictObject({ id: uuid, ownerId: uuid, documentId: uuid, targetRevision: revision,
  pluginVersion: z.string().min(1), expiresAt: z.number().int().positive(),
  selection: selectionSchema, sourcePins: z.array(pinSchema).max(12),
  sections: z.array(section).max(2), sourceRefs: z.array(sourceRef).max(24), appliedRevision: revision.nullable() });
export type KnowledgeProposal = z.infer<typeof proposalSchema>;

/** Production adapter pending. All reads must enforce authenticated owner and
 * ancestry. Proposals are private/immutable. commitOwnedProposal must atomically
 * recheck owner, expiry, target CAS and every source pin, consume/apply once, and
 * return the original result on replay. No generic unchecked PATCH is sufficient.
 * Before replacing sections, append the previous sections/sourceRefs/revision
 * to immutable owner-scoped history in that same transaction. No-op/replay must
 * not add a revision or duplicate history. This port alone does not persist it.
 */
export interface ArtistKnowledgeStore {
  loadOwnedContext(actorId: string, documentId: string, signal?: AbortSignal): Promise<unknown | null>;
  storeProposal(proposal: KnowledgeProposal, signal?: AbortSignal): Promise<void>;
  loadOwnedProposal(actorId: string, proposalId: string, signal?: AbortSignal): Promise<unknown | null>;
  commitOwnedProposal(actorId: string, proposalId: string, signal?: AbortSignal): Promise<{ documentRevision: number }>;
}
export class KnowledgeError extends Error {
  constructor(public readonly code: "invalid_input" | "unavailable" | "invalid_context" | "invalid_output" | "revision_conflict" | "proposal_expired") {
    super(code); this.name = "KnowledgeError";
  }
}
export function validateArtistKnowledgeContext(raw: unknown, actorId: string, documentId: string): ArtistKnowledgeContext {
  const parsed = contextSchema.safeParse(raw);
  if (!parsed.success) throw new KnowledgeError("invalid_context");
  const context = parsed.data;
  if (context.ownerId !== actorId || context.documentId !== documentId) throw new KnowledgeError("unavailable");
  const valid: readonly string[] = sectionIds[context.subjectType];
  if ((context.subjectType === "artist" ? context.subjectId !== context.artistId || context.exhibitionId !== null : !context.exhibitionId) ||
    (context.subjectType === "exhibition" && context.subjectId !== context.exhibitionId) ||
    new Set(context.sections.map(s => s.id)).size !== context.sections.length ||
    context.sections.some(s => !valid.includes(s.id)) || context.sourceRefs.some(ref => !context.sections.some(s => s.id === ref.sectionId))) {
    throw new KnowledgeError("invalid_context");
  }
  const seen = new Set<string>();
  let chars = 0;
  for (const source of context.sources) {
    const sameSubject = source.subjectType === context.subjectType && source.subjectId === context.subjectId;
    const allowedAncestor = (source.subjectType === "artist" && source.subjectId === context.artistId && source.exhibitionId === null) ||
      (source.subjectType === "exhibition" && context.subjectType === "artwork" && source.subjectId === context.exhibitionId);
    if (source.ownerId !== actorId || source.artistId !== context.artistId || (!sameSubject && !allowedAncestor) ||
      (source.subjectType === "artist" ? source.exhibitionId !== null : source.exhibitionId !== context.exhibitionId) ||
      seen.has(source.id) || !source.text.trim() ||
      (source.ref.kind === "direct" && !sameSubject) ||
      (source.ref.kind === "document" && (source.ref.sourceDocumentId === documentId || source.ref.sourceRevision !== source.revision ||
        source.subjectType === context.subjectType || !(sectionIds[source.subjectType] as readonly string[]).includes(source.ref.sourceSectionId)))) {
      throw new KnowledgeError("invalid_context");
    }
    chars += codepoints(source.text); seen.add(source.id);
  }
  if (chars > 8000) throw new KnowledgeError("invalid_context");
  return context;
}
function planSelection(output: unknown, context: ArtistKnowledgeContext) {
  const parsed = selectionSchema.safeParse(output);
  if (!parsed.success) throw new KnowledgeError("invalid_output");
  const selection = parsed.data;
  const allowed: readonly string[] = sectionIds[context.subjectType];
  const used = new Set<string>();
  const sections = [...context.sections];
  let refs = [...context.sourceRefs];
  const pins: z.infer<typeof pinSchema>[] = [];
  if (new Set(selection.sections.map(s => s.id)).size !== selection.sections.length) throw new KnowledgeError("invalid_output");
  for (const chosen of selection.sections) {
    if (!allowed.includes(chosen.id)) throw new KnowledgeError("invalid_output");
    const sources = chosen.sourceIds.map(id => {
      const source = context.sources.find(s => s.id === id);
      if (!source || used.has(id)) throw new KnowledgeError("invalid_output");
      used.add(id); pins.push({ id, revision: source.revision, hash: textHash(JSON.stringify(source)) });
      return source;
    });
    const next = section.safeParse({ id: chosen.id, body: sources.map(s => s.text).join("\n\n") });
    if (!next.success) throw new KnowledgeError("invalid_output");
    const index = sections.findIndex(s => s.id === chosen.id);
    if (index === -1) sections.push(next.data); else sections[index] = next.data;
    refs = refs.filter(ref => ref.sectionId !== chosen.id);
    for (const source of sources) {
      const ref = { ...source.ref, sectionId: chosen.id };
      if (!refs.some(existing => JSON.stringify(existing) === JSON.stringify(ref))) refs.push(ref);
    }
  }
  if (refs.length > 24) throw new KnowledgeError("invalid_output");
  return { selection, sections, sourceRefs: refs, sourcePins: pins };
}

/** actorId must come from verified server auth, never from the request body. */
export function createArtistKnowledgeHarness(actorId: string, deps: { store: ArtistKnowledgeStore; text: AiTextProvider; now?: () => number }) {
  if (!uuid.safeParse(actorId).success) throw new KnowledgeError("invalid_input");
  const now = deps.now ?? Date.now;
  const readProposal = async (id: string, signal?: AbortSignal) => {
    const saved = proposalSchema.safeParse(await deps.store.loadOwnedProposal(actorId, id, signal));
    assertNotCancelled(signal);
    if (!saved.success || saved.data.ownerId !== actorId || saved.data.id !== id) throw new KnowledgeError("unavailable");
    if (saved.data.appliedRevision !== null && saved.data.appliedRevision < saved.data.targetRevision) throw new KnowledgeError("invalid_context");
    return saved.data;
  };
  return {
    async propose(input: { documentId: string; expectedRevision: number }, signal?: AbortSignal): Promise<KnowledgeProposal | null> {
      const parsed = z.strictObject({ documentId: uuid, expectedRevision: revision }).safeParse(input);
      if (!parsed.success) throw new KnowledgeError("invalid_input");
      assertNotCancelled(signal); assertPlaybookToolConfigured("artist-organize", "author.read");
      const raw = await deps.store.loadOwnedContext(actorId, parsed.data.documentId, signal);
      assertNotCancelled(signal);
      if (!raw) throw new KnowledgeError("unavailable");
      const context = validateArtistKnowledgeContext(raw, actorId, parsed.data.documentId);
      if (context.revision !== parsed.data.expectedRevision) throw new KnowledgeError("revision_conflict");
      if (!context.sources.length) return null;
      const generated = await deps.text.generate({ system: playbookPrompt("artist-organize"), schema: organizationJsonSchema, signal,
        input: JSON.stringify({ subjectType: context.subjectType, sources: context.sources.map(({ id, text }) => ({ id, text })) }) });
      assertNotCancelled(signal);
      const plan = planSelection(generated.output, context);
      if (!plan.selection.sections.length) return null;
      const proposal: KnowledgeProposal = { id: randomUUID(), ownerId: actorId, documentId: context.documentId,
        targetRevision: context.revision, pluginVersion: PLUGIN_VERSION, expiresAt: now() + 15 * 60 * 1000,
        ...plan, appliedRevision: null };
      assertPlaybookToolConfigured("artist-organize", "proposal.store");
      await deps.store.storeProposal(proposal, signal);
      return proposal;
    },
    async apply(input: { proposalId: string; reviewed: true }, signal?: AbortSignal): Promise<{ documentRevision: number }> {
      const parsed = z.strictObject({ proposalId: uuid, reviewed: z.literal(true) }).safeParse(input);
      if (!parsed.success) throw new KnowledgeError("invalid_input");
      assertNotCancelled(signal); assertPlaybookToolConfigured("artist-apply", "proposal.read");
      const proposal = await readProposal(parsed.data.proposalId, signal);
      if (proposal.appliedRevision !== null) {
        return { documentRevision: proposal.appliedRevision };
      }
      try {
        if (proposal.expiresAt <= now()) throw new KnowledgeError("proposal_expired");
        if (proposal.pluginVersion !== PLUGIN_VERSION) throw new KnowledgeError("revision_conflict");
        assertPlaybookToolConfigured("artist-apply", "author.read");
        const context = validateArtistKnowledgeContext(await deps.store.loadOwnedContext(actorId, proposal.documentId, signal), actorId, proposal.documentId);
        assertNotCancelled(signal);
        if (context.revision !== proposal.targetRevision) throw new KnowledgeError("revision_conflict");
        let rebuilt: ReturnType<typeof planSelection>;
        try { rebuilt = planSelection(proposal.selection, context); }
        catch { throw new KnowledgeError("revision_conflict"); }
        if (JSON.stringify(rebuilt.sections) !== JSON.stringify(proposal.sections) || JSON.stringify(rebuilt.sourceRefs) !== JSON.stringify(proposal.sourceRefs) ||
          JSON.stringify(rebuilt.sourcePins) !== JSON.stringify(proposal.sourcePins)) throw new KnowledgeError("revision_conflict");
      } catch (error) {
        if (!(error instanceof KnowledgeError)) throw error;
        // Another request may have atomically committed this proposal between
        // our reads. Return that result instead of a stale preflight conflict.
        const latest = await readProposal(proposal.id, signal);
        if (latest.appliedRevision !== null) return { documentRevision: latest.appliedRevision };
        throw error;
      }
      assertPlaybookToolConfigured("artist-apply", "proposal.apply");
      // Atomic adapter is the final authority for races after these prechecks.
      // Don't report cancellation after the store has committed successfully.
      return deps.store.commitOwnedProposal(actorId, proposal.id, signal);
    },
  };
}
