import "server-only";
import type { JobLifecycle } from "./job-lifecycle";
import type { NarrationResult } from "./narration";
import type { ArtistKnowledgeStore, KnowledgeOrganizationResult } from "./artist-knowledge";
import type { PublicationStore } from "./contracts";
import type { VisitorLifecycle } from "./visitor-lifecycle";
import type { AudioRunResult, AuthorAudioStore } from "./audio-types";
import type { VisitorVoiceStore } from "./visitor-voice-types";
import type { ExpectedQaStore } from "./expected-qa";
import type { PreviewStore } from "./preview";
import type { QaRewriteStore } from "./qa-rewrite";
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
type JobResult<Id> = Id extends "narration-draft" ? NarrationResult : Id extends "narration-audio" ? AudioRunResult : KnowledgeOrganizationResult;
type CapabilityMap<Id> = {
  "status.read": () => Promise<unknown | null>;
  "support.read": () => Promise<unknown | null>;
  "voice.reserve": VisitorVoiceStore["reserve"];
  "voice.complete": VisitorVoiceStore["complete"];
  "voice.read": VisitorVoiceStore["read"];
  "voice.store": VisitorVoiceStore["store"];
  "audio.read": AuthorAudioStore["read"];
  "audio.store": AuthorAudioStore["store"];
  "request.reserve": VisitorLifecycle["reserve"] | undefined;
  "answer.store": VisitorLifecycle["store"] | undefined;
  "gap.record": VisitorLifecycle["recordGap"] | undefined;
  "job.reserve": JobLifecycle<JobResult<Id>>["reserve"] | undefined;
  "job.complete": JobLifecycle<JobResult<Id>>["complete"] | undefined;
  "publication.list": PublicationStore["listLabels"];
  "publication.read": PublicationStore["load"];
  "publication.recheck": PublicationStore["isCurrent"];
  "publication.history": PublicationStore["wasNumberPublished"];
  "author.read": ArtistKnowledgeStore["loadOwnedContext"];
  "proposal.store": ArtistKnowledgeStore["storeProposal"];
  "proposal.read": ArtistKnowledgeStore["loadOwnedProposal"];
  "proposal.apply": ArtistKnowledgeStore["commitOwnedProposal"];
  "qa.reserve": ExpectedQaStore["reserve"];
  "qa.complete": ExpectedQaStore["complete"];
  "preview.reserve": PreviewStore["reserve"];
  "preview.complete": PreviewStore["complete"];
  "rewrite.reserve": QaRewriteStore["reserve"];
  "rewrite.complete": QaRewriteStore["complete"];
};

type PlaybookCapabilities = {
  [Id in PlaybookId]: Readonly<Pick<CapabilityMap<Id>, Playbooks[Id]["tools"][number]>>;
};

type CapabilityStores<Id> = {
  status?: { read: CapabilityMap<Id>["status.read"] };
  support?: { read: CapabilityMap<Id>["support.read"] };
  voice?: VisitorVoiceStore;
  audio?: AuthorAudioStore;
  visitor?: VisitorLifecycle;
  jobs?: JobLifecycle<JobResult<Id>>;
  publications?: PublicationStore;
  author?: Pick<ArtistKnowledgeStore, "loadOwnedContext">;
  proposals?: Pick<ArtistKnowledgeStore, "storeProposal" | "loadOwnedProposal" | "commitOwnedProposal">;
  expectedQa?: ExpectedQaStore;
  preview?: PreviewStore;
  qaRewrite?: QaRewriteStore;
};

function requireStore<Store>(store: Store | undefined): Store {
  if (!store) throw new Error("playbook_store_missing");
  return store;
}

const bindCapability = {
  "status.read": ({ status }) => requireStore(status).read.bind(status),
  "support.read": ({ support }) => requireStore(support).read.bind(support),
  "voice.reserve": ({ voice }) => requireStore(voice).reserve.bind(voice),
  "voice.complete": ({ voice }) => requireStore(voice).complete.bind(voice),
  "voice.read": ({ voice }) => requireStore(voice).read.bind(voice),
  "voice.store": ({ voice }) => requireStore(voice).store.bind(voice),
  "audio.read": ({ audio }) => requireStore(audio).read.bind(audio),
  "audio.store": ({ audio }) => requireStore(audio).store.bind(audio),
  "request.reserve": ({ visitor }) => visitor?.reserve.bind(visitor),
  "answer.store": ({ visitor }) => visitor?.store.bind(visitor),
  "gap.record": ({ visitor }) => visitor?.recordGap?.bind(visitor),
  "job.reserve": ({ jobs }) => jobs?.reserve.bind(jobs),
  "job.complete": ({ jobs }) => jobs?.complete.bind(jobs),
  "publication.list": ({ publications }) => publications?.listLabels?.bind(publications),
  "publication.read": ({ publications }) => requireStore(publications).load.bind(publications),
  "publication.recheck": ({ publications }) => requireStore(publications).isCurrent.bind(publications),
  "publication.history": ({ publications }) => publications?.wasNumberPublished?.bind(publications),
  "author.read": ({ author }) => requireStore(author).loadOwnedContext.bind(author),
  "proposal.store": ({ proposals }) => requireStore(proposals).storeProposal.bind(proposals),
  "proposal.read": ({ proposals }) => requireStore(proposals).loadOwnedProposal.bind(proposals),
  "proposal.apply": ({ proposals }) => requireStore(proposals).commitOwnedProposal.bind(proposals),
  "qa.reserve": ({ expectedQa }) => requireStore(expectedQa).reserve.bind(expectedQa),
  "qa.complete": ({ expectedQa }) => requireStore(expectedQa).complete.bind(expectedQa),
  "preview.reserve": ({ preview }) => requireStore(preview).reserve.bind(preview),
  "preview.complete": ({ preview }) => requireStore(preview).complete.bind(preview),
  "rewrite.reserve": ({ qaRewrite }) => requireStore(qaRewrite).reserve.bind(qaRewrite),
  "rewrite.complete": ({ qaRewrite }) => requireStore(qaRewrite).complete.bind(qaRewrite),
} satisfies { [Tool in PluginTool]: (stores: CapabilityStores<PlaybookId>) => CapabilityMap<PlaybookId>[Tool] };

/** Server workflows choose the playbook. Store ports enforce ownership and publication access. */
export function capabilitiesFor<Id extends PlaybookId>(id: Id, stores: CapabilityStores<NoInfer<Id>>): PlaybookCapabilities[Id] {
  const entries = yeobekPlugin.playbooks[id].tools.map(tool => [tool, bindCapability[tool](stores as CapabilityStores<PlaybookId>)] as const);
  return Object.freeze(Object.fromEntries(entries)) as PlaybookCapabilities[Id];
}

export const DOCENT_COPY = yeobekPlugin.messages;
