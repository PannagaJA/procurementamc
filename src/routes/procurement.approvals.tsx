import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/procurement/MyApprovals";

export const Route = createFileRoute("/procurement/approvals")({
  ssr: false,
  component: Page,
});
