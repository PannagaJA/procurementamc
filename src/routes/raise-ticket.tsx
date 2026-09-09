import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/TicketRaiser";

export const Route = createFileRoute("/raise-ticket")({
  ssr: false,
  component: Page,
});
