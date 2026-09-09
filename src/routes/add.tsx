import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/AddInventory";

export const Route = createFileRoute("/add")({
  ssr: false,
  component: Page,
});
