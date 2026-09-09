import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/librarian/IssueBook";

export const Route = createFileRoute("/librarian/issue")({
  ssr: false,
  component: Page,
});
