import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/AdminTicketDashboard";

export const Route = createFileRoute("/admin/tickets")({
  ssr: false,
  component: Page,
});
