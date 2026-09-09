import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/librarian/Reports";

export const Route = createFileRoute("/librarian/reports/$type")({
  ssr: false,
  component: Page,
});
