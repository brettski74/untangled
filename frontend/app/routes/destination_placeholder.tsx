import { Link } from "react-router";

import type { NavPredicate } from "../shell/nav_schema";

export type DestinationPlaceholderProps = {
  section_display_name: string;
  option_display_name: string;
  option_type: "new" | "list";
  class_name: string;
  path: string;
  predicate?: NavPredicate;
};

/**
 * Thin content-pane stand-in until #13 replaces list/detail/new in place.
 * Predicate echo is non-authoritative until search executes (#13/#14).
 */
export function DestinationPlaceholder({
  section_display_name,
  option_display_name,
  option_type,
  class_name,
  path,
  predicate,
}: DestinationPlaceholderProps) {
  return (
    <div className="px-6 py-8">
      <h1 className="text-lg font-semibold tracking-tight mb-2">
        {section_display_name} — {option_display_name}
      </h1>
      <p className="text-sm text-slate-600 max-w-prose mb-4">
        Placeholder destination (<code className="text-xs">{path}</code>,{" "}
        <code className="text-xs">{class_name}</code>, {option_type}). Real
        list/detail/new UI lands in{" "}
        <a
          className="underline"
          href="https://github.com/brettski74/untangled/issues/13"
        >
          #13
        </a>
        ; live search and richer session wiring in{" "}
        <a
          className="underline"
          href="https://github.com/brettski74/untangled/issues/14"
        >
          #14
        </a>
        .
      </p>
      {option_type === "list" ? (
        <pre className="text-xs bg-slate-100 text-slate-800 rounded p-3 overflow-auto max-w-3xl">
          {predicate == null
            ? "predicate: (match-all)"
            : JSON.stringify(predicate, null, 2)}
        </pre>
      ) : (
        <p className="text-sm text-slate-600">
          New-object form placeholder — no API create yet.
        </p>
      )}
      <p className="mt-6 text-xs text-slate-500">
        <Link className="underline" to="/">
          Default landing
        </Link>
      </p>
    </div>
  );
}
