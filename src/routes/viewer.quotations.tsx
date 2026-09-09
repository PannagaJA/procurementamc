import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/ViewerQuotations";

export const Route = createFileRoute("/viewer/quotations")({
  ssr: false,
  component: Page,
});
