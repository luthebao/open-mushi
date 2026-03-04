import type { JsonValue } from "@openmushi/plugin-fs-sync";
import type { PromptStorage } from "@openmushi/store";

export function frontmatterToPrompt(
  frontmatter: Record<string, unknown>,
  body: string,
): PromptStorage {
  return {
    user_id: String(frontmatter.user_id ?? ""),
    task_type: String(frontmatter.task_type ?? ""),
    content: body,
  };
}

export function promptToFrontmatter(prompt: PromptStorage): {
  frontmatter: Record<string, JsonValue>;
  body: string;
} {
  const { content, ...frontmatterFields } = prompt;
  return {
    frontmatter: {
      user_id: frontmatterFields.user_id ?? "",
      task_type: frontmatterFields.task_type ?? "",
    },
    body: content ?? "",
  };
}
