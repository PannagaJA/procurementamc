import { createFileRoute } from "@tanstack/react-router";
import ArchitecturePage from "@/pages/Architecture";

export const Route = createFileRoute("/architecture")({
  ssr: false,
  component: ArchitecturePage,
});
