import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/procurement/InvoiceManagement";

export const Route = createFileRoute("/procurement/invoices")({
  ssr: false,
  component: Page,
});
