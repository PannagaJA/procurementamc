import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/PrincipalDashboard";

export const Route = createFileRoute("/principal/")({
  ssr: false,
  component: Page,
});
