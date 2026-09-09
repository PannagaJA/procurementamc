import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/DepartmentManagement";

export const Route = createFileRoute("/departments")({
  ssr: false,
  component: Page,
});
