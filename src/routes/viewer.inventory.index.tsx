import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/ViewerInventory";

export const Route = createFileRoute("/viewer/inventory/")({
  ssr: false,
  component: Page,
});
