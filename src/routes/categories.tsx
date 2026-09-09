import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/CategoryManagement";

export const Route = createFileRoute("/categories")({
  ssr: false,
  component: Page,
});
