import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/librarian/ReturnBook";

export const Route = createFileRoute("/librarian/return")({
  ssr: false,
  component: Page,
});
