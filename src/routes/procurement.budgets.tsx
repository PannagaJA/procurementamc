import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/procurement/BudgetManagement";

export const Route = createFileRoute("/procurement/budgets")({
  ssr: false,
  component: Page,
});
