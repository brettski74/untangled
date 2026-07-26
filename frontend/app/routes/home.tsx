import type { Route } from "./+types/home";

/**
 * Authenticated index: layout loader redirects to the permission-aware
 * default landing when one exists. This page is the fail-closed empty
 * shell when the principal has no visible nav destinations.
 */
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
        No destinations available
      </h1>
      <p className="text-sm text-slate-600 max-w-prose">
        Your account has no visible class navigation options. List/detail and
        create content will plug into these routes in{" "}
        <a
          className="underline"
          href="https://github.com/brettski74/untangled/issues/13"
        >
          #13
        </a>
        ; richer session and API wiring in{" "}
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
