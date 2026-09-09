import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/UserDashboard";

export const Route = createFileRoute("/user-dashboard")({
  ssr: false,
  component: Page,
});
