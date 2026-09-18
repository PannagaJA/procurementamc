import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/procurement/RfqManagement";

export const Route = createFileRoute("/procurement/rfqs")({
  ssr: false,
  component: Page,
});
