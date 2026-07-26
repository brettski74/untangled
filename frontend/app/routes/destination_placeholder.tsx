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
 * Thin content-pane stand-in until detail/new (#71) replaces new destinations.
 * List destinations are owned by #13 / #75 and no longer use this placeholder.
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
        detail/new UI lands in{" "}
        <a
          className="underline"
          href="https://github.com/brettski74/untangled/issues/71"
        >
          #71
        </a>
        ; list view is{" "}
        <a
          className="underline"
          href="https://github.com/brettski74/untangled/issues/13"
        >
          #13
        </a>
        ; token refresh / richer session in{" "}
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
          New-object form placeholder — replaced in place by #71.
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
