import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/procurement/RaiseRequisition";

export const Route = createFileRoute("/procurement/raise-pr")({
  ssr: false,
  component: Page,
});
