import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/procurement/GrnManagement";

export const Route = createFileRoute("/procurement/grns")({
  ssr: false,
  component: Page,
});
