import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/procurement/EmergencyProcurement";

export const Route = createFileRoute("/procurement/emergency")({
  ssr: false,
  component: Page,
});
