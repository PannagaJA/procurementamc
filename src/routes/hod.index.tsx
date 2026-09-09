import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/HodDashboard";

export const Route = createFileRoute("/hod/")({
  ssr: false,
  component: Page,
});
