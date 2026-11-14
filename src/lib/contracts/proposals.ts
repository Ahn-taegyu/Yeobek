import { z } from "zod";
import { MAX_SECTIONS } from "./knowledge-sections";
import { revision, section, sourceRef, uuid } from "./requests";

export const generateProposalSchema = z.strictObject({ requestId: uuid, expectedDocumentRevision: revision });
export const applyProposalSchema = z.strictObject({ reviewed: z.literal(true) });
export const appliedProposalResponse = z.object({ documentRevision: revision });
export const documentContent = z.object({ sections: z.array(section).max(MAX_SECTIONS), sourceRefs: z.array(sourceRef).max(24) });
export const proposalResponse = z.object({
  id: uuid, documentId: uuid, targetRevision: revision, expiresAt: z.iso.datetime({ offset: true }),
  appliedRevision: revision.nullable(), mock: z.boolean(),
  before: documentContent.extend({ revision }), proposed: documentContent,
  changes: z.array(z.object({ sectionId: section.shape.id, before: z.string().nullable(), after: z.string().nullable() })).max(MAX_SECTIONS),
});
export const historyQuery = z.object({
  beforeRevision: z.string().regex(/^[1-9][0-9]{0,9}$/).optional(),
  limit: z.string().regex(/^(?:[1-9]|[1-4][0-9]|50)$/).optional(),
});
export const historyResponse = z.object({
  items: z.array(documentContent.extend({ proposalId: uuid, revision, createdAt: z.iso.datetime({ offset: true }) })).max(50),
  nextBeforeRevision: revision.nullable(),
});
export type GenerateProposal = z.infer<typeof generateProposalSchema>;
