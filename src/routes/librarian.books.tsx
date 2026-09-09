import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/librarian/Books";

export const Route = createFileRoute("/librarian/books")({
  ssr: false,
  component: Page,
});
