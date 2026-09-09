import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/ProcureRequest";

export const Route = createFileRoute("/procure-request")({
  ssr: false,
  component: Page,
});
