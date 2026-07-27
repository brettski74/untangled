import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

type ShellContextBarSlot = {
  slot_ref: RefObject<HTMLDivElement | null>;
  claim_occupant: () => void;
  release_occupant: () => void;
};

const ShellContextBarContext = createContext<ShellContextBarSlot | null>(null);

export const SHELL_CONTEXT_BAR_DUAL_OCCUPANT_ERROR =
  "ShellContextBar: only one portal occupant is allowed at a time";

/**
 * Fail-closed occupancy counter for the shell context-bar portal.
 * A second concurrent claim throws in all environments (not last-writer-wins).
 */
export function claim_shell_context_bar_occupant(current: number): number {
  if (current > 0) {
    throw new Error(SHELL_CONTEXT_BAR_DUAL_OCCUPANT_ERROR);
  }
  return current + 1;
}

export function release_shell_context_bar_occupant(current: number): number {
  return Math.max(0, current - 1);
}

/**
 * Thin shell slot for route-owned context-bar chrome.
 * Portal is the sole mount (ADR 005): routes wrap content in {@link ShellContextBar};
 * layout hosts one always-present strip and tracks occupancy for aria only.
 */
export function ShellContextBarProvider({
  slot_ref,
  set_occupied,
  children,
}: {
  slot_ref: RefObject<HTMLDivElement | null>;
  set_occupied: (occupied: boolean) => void;
  children: ReactNode;
}) {
  const occupant_count_ref = useRef(0);

  const value = useMemo(
    () => ({
      slot_ref,
      claim_occupant: () => {
        occupant_count_ref.current = claim_shell_context_bar_occupant(
          occupant_count_ref.current,
        );
        set_occupied(true);
      },
      release_occupant: () => {
        occupant_count_ref.current = release_shell_context_bar_occupant(
          occupant_count_ref.current,
        );
        set_occupied(occupant_count_ref.current > 0);
      },
    }),
    [slot_ref, set_occupied],
  );
  return (
    <ShellContextBarContext.Provider value={value}>
      {children}
    </ShellContextBarContext.Provider>
  );
}

/**
 * Mount route-owned chrome into the shell context bar for this route's lifetime.
 * At most one occupant may mount at a time.
 */
export function ShellContextBar({ children }: { children: ReactNode }) {
  const slot = useContext(ShellContextBarContext);
  if (slot == null) {
    throw new Error("ShellContextBar must be used within ShellLayout");
  }

  const [target, set_target] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    let claimed = false;
    try {
      slot.claim_occupant();
      claimed = true;
      set_target(slot.slot_ref.current);
    } catch (error) {
      if (claimed) {
        slot.release_occupant();
      }
      throw error;
    }
    return () => {
      set_target(null);
      slot.release_occupant();
    };
  }, [slot]);

  if (target == null) {
    return null;
  }
  return createPortal(children, target);
}
