import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/procurement/ComparativeStatements";

export const Route = createFileRoute("/procurement/cs")({
  ssr: false,
  component: Page,
});
