import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/ItemHistory";

export const Route = createFileRoute("/inventory/$id/history")({
  ssr: false,
  component: Page,
});
