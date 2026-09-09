import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/RequestQuotation";

export const Route = createFileRoute("/request-quotation")({
  ssr: false,
  component: Page,
});
