import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/librarian/Members";

export const Route = createFileRoute("/librarian/members")({
  ssr: false,
  component: Page,
});
