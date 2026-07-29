/**
 * Sync dual-control datetime chrome display to committed form state.
 * Used on pair blur to discard incomplete native date-input drafts.
 */
import { local_datetime_control_parts } from "./format";

/**
 * After editable pair blur: bump remount key and reset parts from committed value.
 * Remount discards sticky incomplete ``<input type="date">`` browser drafts when
 * committed value did not change (e.g. null → null).
 */
export function sync_datetime_chrome_from_committed(
  remount_key: number,
  value: unknown,
): { remount_key: number; parts: { date: string; time: string } } {
  return {
    remount_key: remount_key + 1,
    parts: local_datetime_control_parts(value),
  };
}
