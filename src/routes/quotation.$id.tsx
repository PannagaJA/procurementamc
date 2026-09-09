import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/QuotationResponse";

export const Route = createFileRoute("/quotation/$id")({
  ssr: false,
  component: Page,
});
