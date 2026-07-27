import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

type ShellContextBarSlot = {
  slot_ref: RefObject<HTMLDivElement | null>;
  set_occupied: (occupied: boolean) => void;
};

const ShellContextBarContext = createContext<ShellContextBarSlot | null>(null);

/**
 * Thin shell slot for route-owned context-bar chrome (#76 / #71).
 * Routes portal content via {@link ShellContextBar}; layout only tracks occupancy
 * for aria-hidden (avoids storing React nodes in layout state).
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
  const value = useMemo(
    () => ({ slot_ref, set_occupied }),
    [slot_ref, set_occupied],
  );
  return (
    <ShellContextBarContext.Provider value={value}>
      {children}
    </ShellContextBarContext.Provider>
  );
}

/**
 * Mount interactive chrome into the shell context bar for this route's lifetime.
 */
export function ShellContextBar({ children }: { children: ReactNode }) {
  const slot = useContext(ShellContextBarContext);
  if (slot == null) {
    throw new Error("ShellContextBar must be used within ShellLayout");
  }

  const [target, set_target] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    set_target(slot.slot_ref.current);
    slot.set_occupied(true);
    return () => {
      slot.set_occupied(false);
    };
  }, [slot]);

  if (target == null) {
    return null;
  }
  return createPortal(children, target);
}
