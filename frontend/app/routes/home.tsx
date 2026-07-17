// Placeholder home route — replace/extend in place when the shell UI ticket lands.
import type { Route } from "./+types/home";
import { Welcome } from "../welcome/welcome";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Untangled" },
    { name: "description", content: "Untangled ITSM — Milestone 1 scaffold" },
  ];
}

export default function Home() {
  return <Welcome />;
}
