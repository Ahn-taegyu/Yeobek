import "server-only";
import type { JobLifecycle } from "./job-lifecycle";
import type { NarrationResult } from "./narration";
import type { ArtistKnowledgeStore, KnowledgeOrganizationResult } from "./artist-knowledge";
import type { PublicationStore } from "./contracts";
import type { VisitorLifecycle } from "./visitor-lifecycle";
import { yeobekPlugin } from "./plugin.generated";

type Playbooks = typeof yeobekPlugin.playbooks;
export type PlaybookId = keyof Playbooks;
export type PluginTool = Playbooks[PlaybookId]["tools"][number];
export const PLUGIN_VERSION = `${yeobekPlugin.id}@${yeobekPlugin.version}:${yeobekPlugin.fingerprint.slice(0, 12)}`;

/** Called only by the server workflow, never selected by an untrusted message. */
export function playbookPrompt(id: PlaybookId): string {
  return [yeobekPlugin.instructions, ...yeobekPlugin.playbooks[id].skills.map(name =>
    yeobekPlugin.skills[name].instructions)].join("\n\n");
}
type JobResult<Id> = Id extends "narration-draft" ? NarrationResult : KnowledgeOrganizationResult;
type CapabilityMap<Id> = {
  "request.reserve": VisitorLifecycle["reserve"] | undefined;
  "answer.store": VisitorLifecycle["store"] | undefined;
  "gap.record": VisitorLifecycle["recordGap"] | undefined;
  "job.reserve": JobLifecycle<JobResult<Id>>["reserve"] | undefined;
  "job.complete": JobLifecycle<JobResult<Id>>["complete"] | undefined;
  "publication.read": PublicationStore["load"];
  "publication.recheck": PublicationStore["isCurrent"];
  "author.read": ArtistKnowledgeStore["loadOwnedContext"];
  "proposal.store": ArtistKnowledgeStore["storeProposal"];
  "proposal.read": ArtistKnowledgeStore["loadOwnedProposal"];
  "proposal.apply": ArtistKnowledgeStore["commitOwnedProposal"];
};

type PlaybookCapabilities = {
  [Id in PlaybookId]: Readonly<Pick<CapabilityMap<Id>, Playbooks[Id]["tools"][number]>>;
};

type CapabilityStores<Id> = {
  visitor?: VisitorLifecycle;
  jobs?: JobLifecycle<JobResult<Id>>;
  publications?: PublicationStore;
  author?: Pick<ArtistKnowledgeStore, "loadOwnedContext">;
  proposals?: Pick<ArtistKnowledgeStore, "storeProposal" | "loadOwnedProposal" | "commitOwnedProposal">;
};

function requireStore<Store>(store: Store | undefined): Store {
  if (!store) throw new Error("playbook_store_missing");
  return store;
}

const bindCapability = {
  "request.reserve": ({ visitor }) => visitor?.reserve.bind(visitor),
  "answer.store": ({ visitor }) => visitor?.store.bind(visitor),
  "gap.record": ({ visitor }) => visitor?.recordGap?.bind(visitor),
  "job.reserve": ({ jobs }) => jobs?.reserve.bind(jobs),
  "job.complete": ({ jobs }) => jobs?.complete.bind(jobs),
  "publication.read": ({ publications }) => requireStore(publications).load.bind(publications),
  "publication.recheck": ({ publications }) => requireStore(publications).isCurrent.bind(publications),
  "author.read": ({ author }) => requireStore(author).loadOwnedContext.bind(author),
  "proposal.store": ({ proposals }) => requireStore(proposals).storeProposal.bind(proposals),
  "proposal.read": ({ proposals }) => requireStore(proposals).loadOwnedProposal.bind(proposals),
  "proposal.apply": ({ proposals }) => requireStore(proposals).commitOwnedProposal.bind(proposals),
} satisfies { [Tool in PluginTool]: (stores: CapabilityStores<PlaybookId>) => CapabilityMap<PlaybookId>[Tool] };

/** Server workflows choose the playbook. Store ports enforce ownership and publication access. */
export function capabilitiesFor<Id extends PlaybookId>(id: Id, stores: CapabilityStores<NoInfer<Id>>): PlaybookCapabilities[Id] {
  const entries = yeobekPlugin.playbooks[id].tools.map(tool => [tool, bindCapability[tool](stores as CapabilityStores<PlaybookId>)] as const);
  return Object.freeze(Object.fromEntries(entries)) as PlaybookCapabilities[Id];
}

export const DOCENT_COPY = yeobekPlugin.messages;
