import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/ItemDetails";

export const Route = createFileRoute("/hod/inventory/$id")({
  ssr: false,
  component: Page,
});
