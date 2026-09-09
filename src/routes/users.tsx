import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/UserManagement";

export const Route = createFileRoute("/users")({
  ssr: false,
  component: Page,
});
