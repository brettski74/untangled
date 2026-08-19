import { Link } from "react-router";
import { CircleHelp, Search, Settings } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { LogoutForm } from "../auth/logout_form";

export type ShellHeaderProps = {
  display_name: string;
  username: string;
  csrf_token: string;
};

export function ShellHeader({
  display_name,
  username,
  csrf_token,
}: ShellHeaderProps) {
  const [search_open, set_search_open] = useState(false);
  const [identity_open, set_identity_open] = useState(false);
  const search_input_id = useId();
  const identity_menu_id = useId();
  const identity_root_ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!identity_open) {
      return;
    }
    function on_pointer(event: MouseEvent) {
      if (
        identity_root_ref.current != null &&
        !identity_root_ref.current.contains(event.target as Node)
      ) {
        set_identity_open(false);
      }
    }
    function on_key(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        set_identity_open(false);
      }
    }
    document.addEventListener("mousedown", on_pointer);
    document.addEventListener("keydown", on_key);
    return () => {
      document.removeEventListener("mousedown", on_pointer);
      document.removeEventListener("keydown", on_key);
    };
  }, [identity_open]);

  return (
    <header
      role="banner"
      className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-[var(--color-shell-separator)] bg-[var(--color-shell-chrome)] px-3 text-[var(--color-shell-chrome-fg)]"
    >
      <div className="flex min-w-0 items-center gap-2">
        <img
          src="/UntangledLogo-nobg.svg"
          alt="Untangled"
          className="h-7 w-auto"
        />
      </div>

      {/* Right edge inward per #12: Settings, Help, Search, identity menu. */}
      <div className="flex items-center gap-1">
        <div className="relative" ref={identity_root_ref}>
          <button
            type="button"
            title={username}
            aria-haspopup="menu"
            aria-expanded={identity_open}
            aria-controls={identity_menu_id}
            className="max-w-40 truncate rounded px-2 py-1 text-xs font-medium text-[var(--color-shell-chrome-fg)] hover:bg-white/10"
            onClick={() => set_identity_open((open) => !open)}
          >
            {display_name}
          </button>
          {identity_open ? (
            <ul
              id={identity_menu_id}
              role="menu"
              className="absolute top-full right-0 z-20 mt-1 min-w-44 rounded border border-[var(--color-shell-separator)] bg-[var(--color-shell-chrome)] py-1 shadow-lg"
            >
              <li role="none">
                <Link
                  role="menuitem"
                  to="/change-password"
                  className="block w-full px-3 py-1.5 text-left text-xs text-[var(--color-shell-chrome-fg)] hover:bg-white/10"
                  onClick={() => set_identity_open(false)}
                >
                  Change Password
                </Link>
              </li>
              <li role="none">
                <LogoutForm
                  csrf_token={csrf_token}
                  button_role="menuitem"
                  button_className="block w-full px-3 py-1.5 text-left text-xs text-[var(--color-shell-chrome-muted)] hover:bg-white/10 hover:text-[var(--color-shell-chrome-fg)]"
                />
              </li>
            </ul>
          ) : null}
        </div>

        {search_open ? (
          <div className="flex items-center">
            <label htmlFor={search_input_id} className="sr-only">
              Search
            </label>
            <input
              id={search_input_id}
              type="search"
              autoFocus
              placeholder="Search (omnibox — #15)"
              className="h-7 w-48 rounded border border-[var(--color-shell-separator)] bg-[var(--color-shell-context)] px-2 text-xs text-[var(--color-shell-chrome-fg)] placeholder:text-[var(--color-shell-chrome-muted)]"
              // Chrome-only affordance: no fetch, no token, no API (#15 / ADR 002).
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  set_search_open(false);
                }
              }}
            />
          </div>
        ) : null}

        <HeaderIconButton
          label={search_open ? "Close search" : "Search"}
          on_click={() => set_search_open((open) => !open)}
          pressed={search_open}
        >
          <Search className="h-4 w-4" aria-hidden />
        </HeaderIconButton>

        <HeaderIconButton
          label="Help"
          on_click={() => {
            /* no-op — future help */
          }}
        >
          <CircleHelp className="h-4 w-4" aria-hidden />
        </HeaderIconButton>

        <HeaderIconButton
          label="Settings"
          on_click={() => {
            /* no-op — future settings */
          }}
        >
          <Settings className="h-4 w-4" aria-hidden />
        </HeaderIconButton>
      </div>
    </header>
  );
}

function HeaderIconButton({
  label,
  on_click,
  pressed,
  children,
}: {
  label: string;
  on_click: () => void;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={on_click}
      className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--color-shell-chrome-fg)] hover:bg-white/10"
    >
      {children}
    </button>
  );
}
