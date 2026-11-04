import { format } from "date-fns";
import { Database } from "@/integrations/supabase/types";

export type TicketStatus = Database["public"]["Enums"]["ticket_status"];
export type TicketPriority = Database["public"]["Enums"]["ticket_priority"];

export const ticketStatusOptions: { value: TicketStatus; label: string; color: string }[] = [
  { value: "pending", label: "Pending", color: "yellow" },
  { value: "in-progress", label: "In Progress", color: "blue" },
  { value: "waiting-for-user", label: "Waiting for User", color: "orange" },
  { value: "resolved", label: "Resolved", color: "green" },
  { value: "completed", label: "Completed", color: "purple" },
  { value: "procure-in-progress", label: "Procure In Progress", color: "blue" },
  { value: "procure-completed", label: "Procure Completed", color: "purple" },
  { value: "procure-approved", label: "Procure Approved", color: "green" },
  { value: "procure-rejected", label: "Procure Rejected", color: "red" },
  { value: "service-approved", label: "Service Approved", color: "green" },
  { value: "service-rejected", label: "Service Rejected", color: "red" },
];

export const ticketPriorityOptions: { value: TicketPriority; label: string; color: string }[] = [
  { value: "low", label: "Low", color: "green" },
  { value: "medium", label: "Medium", color: "yellow" },
  { value: "high", label: "High", color: "red" },
];

export const getCategoryOptions = () => [
  { value: "inventory", label: "Inventory" },
  { value: "hardware", label: "Hardware" },
  { value: "software", label: "Software" },
  { value: "other", label: "Other" },
];

export const getStatusColor = (status: string) => {
  switch (status) {
    case "pending":
      return "bg-yellow-100 text-yellow-800";
    case "in-progress":
      return "bg-blue-100 text-blue-800";
    case "waiting-for-user":
      return "bg-orange-100 text-orange-800";
    case "resolved":
      return "bg-green-100 text-green-800";
    case "completed":
      return "bg-purple-100 text-purple-800";
    case "procure-in-progress":
      return "bg-blue-100 text-blue-800";
    case "procure-completed":
      return "bg-purple-100 text-purple-800";
    case "procure-approved":
      return "bg-green-100 text-green-800";
    case "procure-rejected":
      return "bg-red-100 text-red-800";
    case "service-approved":
      return "bg-emerald-100 text-emerald-800";
    case "service-rejected":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

export const getPriorityColor = (priority: string) => {
  switch (priority) {
    case "low":
      return "bg-green-100 text-green-800";
    case "medium":
      return "bg-yellow-100 text-yellow-800";
    case "high":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
};

export const TICKET_SLA_RULES: Record<string, { respondHours: number; resolveHours: number }> = {
  high: { respondHours: 1, resolveHours: 8 },
  medium: { respondHours: 4, resolveHours: 48 },
  low: { respondHours: 24, resolveHours: 168 },
};

// Closed tickets are never "overdue".
const CLOSED_STATUSES = new Set([
  "resolved",
  "completed",
  "procure-completed",
  "procure-rejected",
  "service-rejected",
]);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Adds `ticket.sla` (deadlines from priority + created_at) and returns the same ticket. */
export const computeTicketSLA = <T>(ticket: T): T => {
  const t = ticket as { created_at: string; priority: string; status: string; sla?: unknown };
  const created = new Date(t.created_at);
  if (isNaN(created.getTime())) return ticket;
  const rule = TICKET_SLA_RULES[t.priority] || TICKET_SLA_RULES.low;
  const respondBy = new Date(created.getTime() + rule.respondHours * HOUR);
  const resolveBy = new Date(created.getTime() + rule.resolveHours * HOUR);
  const now = Date.now();
  const daysOver = (deadline: Date) =>
    CLOSED_STATUSES.has(t.status) ? 0 : Math.max(0, Math.floor((now - deadline.getTime()) / DAY));
  t.sla = {
    respondByISO: respondBy.toISOString(),
    respondByDisplay: format(respondBy, "PP p"),
    respondDaysOver: daysOver(respondBy),
    resolveByISO: resolveBy.toISOString(),
    resolveByDisplay: format(resolveBy, "PP p"),
    resolveDaysOver: daysOver(resolveBy),
  };
  return ticket;
};
