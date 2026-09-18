import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/procurement/ProcurementHub";

export const Route = createFileRoute("/procurement/")({
  ssr: false,
  component: Page,
});
