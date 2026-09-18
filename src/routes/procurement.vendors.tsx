import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/procurement/VendorManagement";

export const Route = createFileRoute("/procurement/vendors")({
  ssr: false,
  component: Page,
});
