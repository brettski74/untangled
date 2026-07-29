import { Link2, Menu, RefreshCw, Save, SaveCheck } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export type DetailContextBarProps = {
  class_display_name: string;
  title_token: string;
  copy_url: string;
  dirty: boolean;
  /** When false, Save is disabled (no update permission or clean). */
  save_enabled: boolean;
  save_pending?: boolean;
  on_save: () => void;
  on_refresh: () => void;
  refresh_pending?: boolean;
};

const MENU_ITEMS = [
  "Print…",
  "Export…",
  "Assign…",
  "Follow…",
  "Delete…",
] as const;

/**
 * Detail context bar: inert menu, title, dirty-aware save, copy-link, refresh.
 */
export function DetailContextBar({
  class_display_name,
  title_token,
  copy_url,
  dirty,
  save_enabled,
  save_pending = false,
  on_save,
  on_refresh,
  refresh_pending = false,
}: DetailContextBarProps) {
  const [menu_open, set_menu_open] = useState(false);
  const [copy_status, set_copy_status] = useState<string | null>(null);
  const menu_id = useId();
  const menu_ref = useRef<HTMLDivElement>(null);
  const SaveIcon = dirty ? Save : SaveCheck;

  useEffect(() => {
    if (!menu_open) {
      return;
    }
    function on_pointer(event: MouseEvent) {
      if (
        menu_ref.current != null &&
        !menu_ref.current.contains(event.target as Node)
      ) {
        set_menu_open(false);
      }
    }
    document.addEventListener("mousedown", on_pointer);
    return () => document.removeEventListener("mousedown", on_pointer);
  }, [menu_open]);

  async function copy_link() {
    const absolute =
      copy_url.startsWith("http://") || copy_url.startsWith("https://")
        ? copy_url
        : `${window.location.origin}${copy_url.startsWith("/") ? copy_url : `/${copy_url}`}`;
    try {
      await navigator.clipboard.writeText(absolute);
      set_copy_status("Copied");
    } catch {
      set_copy_status("Copy failed");
    }
    window.setTimeout(() => set_copy_status(null), 1500);
  }

  return (
    <div className="flex h-10 w-full items-center gap-2 px-2 text-[var(--color-shell-chrome-fg)]">
      <div className="relative" ref={menu_ref}>
        <button
          type="button"
          title="Context menu"
          aria-haspopup="menu"
          aria-expanded={menu_open}
          aria-controls={menu_id}
          className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-white/10"
          onClick={() => set_menu_open((open) => !open)}
        >
          <Menu className="h-4 w-4" aria-hidden />
          <span className="sr-only">Context menu</span>
        </button>
        {menu_open ? (
          <ul
            id={menu_id}
            role="menu"
            className="absolute left-0 z-20 mt-1 min-w-40 rounded border border-slate-600 bg-slate-800 py-1 text-xs shadow-lg"
          >
            {MENU_ITEMS.map((label) => (
              <li key={label} role="none">
                <button
                  type="button"
                  role="menuitem"
                  disabled
                  className="block w-full cursor-not-allowed px-3 py-1.5 text-left text-slate-400"
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="min-w-0 flex-1 truncate text-sm font-medium">
        <span className="sr-only">Record title:</span>
        {class_display_name} {title_token}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          title={dirty ? "Save" : "Save (no changes)"}
          aria-label="Save"
          disabled={!save_enabled || save_pending}
          className={
            save_enabled
              ? "inline-flex h-8 items-center gap-1.5 rounded border border-[var(--color-shell-separator)] px-2 text-xs text-[var(--color-shell-chrome-fg)] hover:bg-white/10 disabled:opacity-50"
              : "inline-flex h-8 cursor-not-allowed items-center gap-1.5 rounded border border-[var(--color-shell-separator)] px-2 text-xs text-[var(--color-shell-chrome-muted)]"
          }
          onClick={() => on_save()}
        >
          <SaveIcon className="h-4 w-4" aria-hidden />
          Save
        </button>

        <button
          type="button"
          title={copy_status ?? "Copy link"}
          aria-label="Copy link"
          className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-white/10"
          onClick={() => {
            void copy_link();
          }}
        >
          <Link2 className="h-4 w-4" aria-hidden />
        </button>

        <button
          type="button"
          title="Refresh"
          aria-label="Refresh"
          className="inline-flex h-8 w-8 items-center justify-center rounded hover:bg-white/10 disabled:opacity-50"
          disabled={refresh_pending}
          onClick={() => on_refresh()}
        >
          <RefreshCw className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
