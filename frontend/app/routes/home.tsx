import { useOutletContext } from "react-router";

import type { AuthenticatedOutletContext } from "./authenticated";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Untangled" },
    {
      name: "description",
      content: "Authenticated shell stub — login gate for Milestone 1",
    },
  ];
}

export default function Home() {
  const { me } = useOutletContext<AuthenticatedOutletContext>();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold tracking-tight mb-2">
        Authenticated home
      </h1>
      <p className="text-sm text-slate-600 mb-6">
        Minimal stub after login. Shell chrome and YAML nav land in later
        children of{" "}
        <a
          className="underline"
          href="https://github.com/brettski74/untangled/issues/12"
        >
          #12
        </a>
        ; token refresh and richer UI↔API wiring are{" "}
        <a
          className="underline"
          href="https://github.com/brettski74/untangled/issues/14"
        >
          #14
        </a>
        . Broader auth security review is{" "}
        <a
          className="underline"
          href="https://github.com/brettski74/untangled/issues/67"
        >
          #67
        </a>
        .
      </p>

      <section className="mb-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-2">Identity</h2>
        <dl className="text-sm space-y-1">
          <div>
            <dt className="inline text-slate-500">Display name: </dt>
            <dd className="inline">{me.display_name}</dd>
          </div>
          <div>
            <dt className="inline text-slate-500">Username: </dt>
            <dd className="inline">{me.username}</dd>
          </div>
          <div>
            <dt className="inline text-slate-500">Roles: </dt>
            <dd className="inline">
              {me.roles.length > 0 ? me.roles.join(", ") : "(none)"}
            </dd>
          </div>
        </dl>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-slate-800 mb-2">
          Effective permissions
        </h2>
        <p className="text-xs text-slate-500 mb-2">
          From <code className="text-slate-700">GET /auth/me</code> (real RBAC;
          no mock principal).
        </p>
        {me.permissions.length === 0 ? (
          <p className="text-sm text-slate-600">(none)</p>
        ) : (
          <ul className="list-disc list-inside text-sm space-y-0.5 font-mono">
            {me.permissions.map((permission) => (
              <li key={permission}>{permission}</li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
