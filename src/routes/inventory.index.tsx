import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/InventoryList";

export const Route = createFileRoute("/inventory/")({
  ssr: false,
  component: Page,
});
