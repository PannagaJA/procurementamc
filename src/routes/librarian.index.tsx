import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/LibrarianDashboard";

export const Route = createFileRoute("/librarian/")({
  ssr: false,
  component: Page,
});
