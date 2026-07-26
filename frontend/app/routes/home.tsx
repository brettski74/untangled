import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Untangled" },
    {
      name: "description",
      content: "Authenticated operator workspace",
    },
  ];
}

export default function Home() {
  return (
    <div className="px-6 py-8">
      <h1 className="text-lg font-semibold tracking-tight mb-2">
        Content pane
      </h1>
      <p className="text-sm text-slate-600 max-w-prose">
        Shell chrome (header, nav rail, context bar) is live. YAML-driven nav
        sections and destination routes land in{" "}
        <a
          className="underline"
          href="https://github.com/brettski74/untangled/issues/66"
        >
          #66
        </a>
        ; real list/detail content is{" "}
        <a
          className="underline"
          href="https://github.com/brettski74/untangled/issues/13"
        >
          #13
        </a>
        ; token refresh and richer UI↔API wiring are{" "}
        <a
          className="underline"
          href="https://github.com/brettski74/untangled/issues/14"
        >
          #14
        </a>
        .
      </p>
    </div>
  );
}
