import { Schema } from "effect";

import { ChannelProfile, type RenderLabelContext } from "@openmushi/transcript";

import { type Store } from "~/store/tinybase/store/main";

export {
  ChannelProfile,
  type Operations,
  type PartialWord,
  type RenderLabelContext,
  type RuntimeSpeakerHint,
  type Segment,
  type SegmentBuilderOptions,
  SegmentKey,
  type SegmentWord,
  SpeakerLabelManager,
  type WordLike,
} from "@openmushi/transcript";

export const ChannelProfileSchema = Schema.Enums(ChannelProfile);

export const defaultRenderLabelContext = (
  store: Pick<Store, "getValue" | "getRow">,
): RenderLabelContext => {
  return {
    getSelfHumanId: () => {
      const selfId = store.getValue("user_id");
      return typeof selfId === "string" ? selfId : undefined;
    },
    getHumanName: (id: string) => {
      const human = store.getRow("humans", id);
      return typeof human.name === "string" ? human.name : undefined;
    },
  };
};
