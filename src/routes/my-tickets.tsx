import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/UserTickets";

export const Route = createFileRoute("/my-tickets")({
  ssr: false,
  component: Page,
});
