import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/procurement/PurchaseOrders";

export const Route = createFileRoute("/procurement/orders")({
  ssr: false,
  component: Page,
});
