/**
 * Stub for @openmushi/plugin-analytics
 *
 * All cloud analytics have been removed. These are no-op stubs so that
 * existing call-sites compile without modification.
 */

export const commands = {
  /** No-op: would have sent an analytics event. */
  event: async (_payload: { event: string; [key: string]: unknown }): Promise<void> => {},

  /** No-op: would have set user/device properties for analytics. */
  setProperties: async (_payload: { set?: Record<string, unknown>; setOnce?: Record<string, unknown> }): Promise<void> => {},

  /** No-op: would have enabled/disabled analytics collection. */
  setDisabled: async (_disabled: boolean): Promise<void> => {},
};
