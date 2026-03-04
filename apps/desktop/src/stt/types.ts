import type { SpeakerHintStorage, WordStorage } from "@openmushi/store";

export type WordWithId = WordStorage & { id: string };
export type SpeakerHintWithId = SpeakerHintStorage & { id: string };
