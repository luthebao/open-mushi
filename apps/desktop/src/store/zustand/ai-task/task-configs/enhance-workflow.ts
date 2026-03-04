import {
  type LanguageModel,
  smoothStream,
  streamText,
} from "ai";

import { commands as templateCommands } from "@openmushi/plugin-template";

import type { TaskArgsMapTransformed, TaskConfig } from ".";

import type { Store } from "~/store/tinybase/store/main";
import { getCustomPrompt } from "~/store/tinybase/store/prompts";
import { normalizeBulletPoints } from "~/store/zustand/ai-task/shared/transform_impl";

export const enhanceWorkflow: Pick<
  TaskConfig<"enhance">,
  "executeWorkflow" | "transforms"
> = {
  executeWorkflow,
  transforms: [
    normalizeBulletPoints(),
    smoothStream({ delayInMs: 10, chunking: "word" }),
  ],
};

async function* executeWorkflow(params: {
  model: LanguageModel;
  args: TaskArgsMapTransformed["enhance"];
  onProgress: (step: any) => void;
  signal: AbortSignal;
  store: Store;
}) {
  const { model, args, onProgress, signal, store } = params;

  onProgress({ type: "generating" });

  const argsWithTemplate: TaskArgsMapTransformed["enhance"] = {
    ...args,
    template: args.template ?? null,
  };

  const system = await getSystemPrompt(argsWithTemplate);
  const prompt = await getUserPrompt(argsWithTemplate, store);

  const result = streamText({
    model,
    system,
    prompt,
    abortSignal: signal,
  });

  yield* result.fullStream;
}

async function getSystemPrompt(args: TaskArgsMapTransformed["enhance"]) {
  const result = await templateCommands.render({
    enhanceSystem: {
      language: args.language,
    },
  });

  if (result.status === "error") {
    throw new Error(result.error);
  }

  return result.data;
}

async function getUserPrompt(
  args: TaskArgsMapTransformed["enhance"],
  store: Store,
) {
  const {
    session,
    participants,
    template,
    transcripts,
    preMeetingMemo,
    postMeetingMemo,
  } = args;

  const ctx = {
    content: transcripts,
    session,
    participants,
    template,
    pre_meeting_memo: preMeetingMemo,
    post_meeting_memo: postMeetingMemo,
  };

  const customPrompt = getCustomPrompt(store, "enhance");
  if (customPrompt) {
    const result = await templateCommands.renderCustom(customPrompt, ctx);
    if (result.status === "error") {
      throw new Error(result.error);
    }
    return result.data;
  }

  const result = await templateCommands.render({
    enhanceUser: {
      session,
      participants,
      template,
      transcripts,
      preMeetingMemo,
      postMeetingMemo,
    },
  });

  if (result.status === "error") {
    throw new Error(result.error);
  }

  return result.data;
}
