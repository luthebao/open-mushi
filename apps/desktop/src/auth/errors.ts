// Auth error handling removed - local-only mode

export function isFatalSessionError(_error: unknown): boolean {
  return false;
}

export async function clearAuthStorage(): Promise<void> {
  // No-op in local-only mode
}
