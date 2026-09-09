import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/HodInventory";

export const Route = createFileRoute("/hod/inventory/")({
  ssr: false,
  component: Page,
});
