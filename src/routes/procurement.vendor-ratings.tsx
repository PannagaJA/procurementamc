import { createFileRoute } from "@tanstack/react-router";
import Page from "@/pages/procurement/VendorRatings";

export const Route = createFileRoute("/procurement/vendor-ratings")({
  ssr: false,
  component: Page,
});
