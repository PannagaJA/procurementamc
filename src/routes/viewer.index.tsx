import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/ViewerDashboard";

export const Route = createFileRoute("/viewer/")({
  ssr: false,
  component: Page,
});
