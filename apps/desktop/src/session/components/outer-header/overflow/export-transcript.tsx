import { useMutation } from "@tanstack/react-query";
import { FileTextIcon, Loader2Icon } from "lucide-react";
import { useMemo } from "react";

import { commands as analyticsCommands } from "@openmushi/plugin-analytics";
type VttWord = {
  text: string;
  start_ms: number;
  end_ms: number;
  speaker: string;
};
import { commands as openerCommands } from "@openmushi/plugin-opener2";
import { DropdownMenuItem } from "@openmushi/ui/components/ui/dropdown-menu";

import * as main from "~/store/tinybase/store/main";
import { buildSegments, SegmentKey } from "~/stt/segment";
import {
  defaultRenderLabelContext,
  SpeakerLabelManager,
} from "~/stt/segment/shared";
import { convertStorageHintsToRuntime } from "~/stt/speaker-hints";
import { parseTranscriptHints, parseTranscriptWords } from "~/stt/utils";

export function ExportTranscript({ sessionId }: { sessionId: string }) {
  const store = main.UI.useStore(main.STORE_ID);

  const transcriptIds = main.UI.useSliceRowIds(
    main.INDEXES.transcriptBySession,
    sessionId,
    main.STORE_ID,
  );

  const words = useMemo(() => {
    if (!store || !transcriptIds || transcriptIds.length === 0) {
      return [];
    }

    const wordIdToIndex = new Map<string, number>();
    const collectedWords: Array<{
      id: string;
      text: string;
      start_ms: number;
      end_ms: number;
      channel: number;
    }> = [];

    const firstStartedAt = store.getCell(
      "transcripts",
      transcriptIds[0],
      "started_at",
    );

    for (const transcriptId of transcriptIds) {
      const startedAt = store.getCell(
        "transcripts",
        transcriptId,
        "started_at",
      );
      const offset =
        typeof startedAt === "number" && typeof firstStartedAt === "number"
          ? startedAt - firstStartedAt
          : 0;

      const words = parseTranscriptWords(store, transcriptId);
      for (const word of words) {
        if (
          word.text === undefined ||
          word.start_ms === undefined ||
          word.end_ms === undefined
        ) {
          continue;
        }
        collectedWords.push({
          id: word.id,
          text: word.text,
          start_ms: word.start_ms + offset,
          end_ms: word.end_ms + offset,
          channel: word.channel ?? 0,
        });
      }
    }

    collectedWords.sort((a, b) => a.start_ms - b.start_ms);
    collectedWords.forEach((w, i) => wordIdToIndex.set(w.id, i));

    const storageHints = transcriptIds.flatMap((id) =>
      parseTranscriptHints(store, id),
    );
    const speakerHints = convertStorageHintsToRuntime(
      storageHints,
      wordIdToIndex,
    );

    const segments = buildSegments(collectedWords, [], speakerHints);
    const ctx = defaultRenderLabelContext(store);
    const manager = SpeakerLabelManager.fromSegments(segments, ctx);

    const vttWords: VttWord[] = [];
    for (const segment of segments) {
      if (segment.words.length === 0) continue;
      const speakerLabel = SegmentKey.renderLabel(segment.key, ctx, manager);
      const firstWord = segment.words[0];
      const lastWord = segment.words[segment.words.length - 1];
      vttWords.push({
        text: segment.words.map((w) => w.text).join(" "),
        start_ms: firstWord.start_ms,
        end_ms: lastWord.end_ms,
        speaker: speakerLabel,
      });
    }

    return vttWords;
  }, [store, transcriptIds]);

  const { mutate, isPending } = useMutation({
    mutationFn: async (): Promise<string> => {
      // TODO: listener2 plugin removed - export not yet reimplemented
      throw new Error("Export not available: listener2 plugin not present");
    },
    onSuccess: (path) => {
      void analyticsCommands.event({
        event: "session_exported",
        format: "vtt",
        word_count: words.length,
      });
      openerCommands.openPath(path, null);
    },
  });

  return (
    <DropdownMenuItem
      onClick={(e) => {
        e.preventDefault();
        mutate();
      }}
      disabled={isPending || words.length === 0}
      className="cursor-pointer"
    >
      {isPending ? <Loader2Icon className="animate-spin" /> : <FileTextIcon />}
      <span>{isPending ? "Exporting..." : "Export Transcript"}</span>
    </DropdownMenuItem>
  );
}
