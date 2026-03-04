// Cloud audio upload (Supabase storage) removed. This hook is stubbed as a no-op.

import { useCallback, useState } from "react";

export function useUploadAudio() {
  const [progress, setProgress] = useState<number | null>(null);

  const upload = useCallback(
    async (_filePath: string): Promise<string> => {
      throw new Error("Audio upload not available: Supabase storage removed");
    },
    [],
  );

  const abort = useCallback(() => {
    setProgress(null);
  }, []);

  return { upload, abort, progress };
}
