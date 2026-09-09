import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/PrincipalApprovals";

export const Route = createFileRoute("/principal/approvals")({
  ssr: false,
  component: Page,
});
