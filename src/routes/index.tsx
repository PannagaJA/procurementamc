import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/Dashboard";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Page,
});
