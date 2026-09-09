import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/ItemDetails";

export const Route = createFileRoute("/inventory/$id")({
  ssr: false,
  component: Page,
});
