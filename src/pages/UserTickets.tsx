import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "../integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { CalendarIcon, EyeIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import Layout from "@/components/Layout";

interface Ticket {
  id: string;
  ticket_number: string;
  name: string;
  email: string;
  contact_number: string | null;
  department: string | null;
  issue_category: string;
  issue_description: string;
  priority: "low" | "medium" | "high";
  // added service statuses
  status:
    | "pending"
    | "in-progress"
    | "waiting-for-user"
    | "completed"
    | "procure-in-progress"
    | "procure-completed"
    | "procure-approved"
    | "procure-rejected"
    | "service-approved"
    | "service-rejected";
  created_at: string;
  updated_at: string;
  ticket_updates: {
    admin_notes: string | null;
    created_at: string;
    status_from: string | null;
    status_to: string | null;
  }[];
}

const UserTickets = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [filteredTickets, setFilteredTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    status: "all",
    priority: "all",
    category: "all",
  });
  const [openUpdateTicketId, setOpenUpdateTicketId] = useState<string | null>(null);
  const [viewTicket, setViewTicket] = useState<Ticket | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Function to format procure ticket description
  const formatProcureDescription = (description: string) => {
    const lines = description.split("\n").filter((line) => line.trim());
    const data: { [key: string]: string } = {};

    lines.forEach((line) => {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        data[key] = value;
      }
    });

    return data;
  };

  // Function to render ticket description
  const renderTicketDescription = (ticket: Ticket) => {
    if (ticket.issue_category === "procure") {
      const procureData = formatProcureDescription(ticket.issue_description);
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <strong>Device:</strong> {procureData["Device Name"]}
            </div>
            <div>
              <strong>Quantity:</strong> {procureData["Quantity"]}
            </div>
          </div>
          <div>
            <strong>Specifications:</strong> {procureData["Specifications"]}
          </div>
          <div>
            <strong>Estimated Cost:</strong> ₹{procureData["Estimated Cost"]}
          </div>
          <div>
            <strong>Justification:</strong> {procureData["Justification"]}
          </div>
          {procureData["Approval Letter"] && (
            <div>
              <strong>Approval Letter:</strong>{" "}
              <a
                href={procureData["Approval Letter"]}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 hover:underline"
              >
                View Document
              </a>
            </div>
          )}
        </div>
      );
    }
    return <p>{ticket.issue_description}</p>;
  };

  useEffect(() => {
    fetchUserTickets();
  }, []);

  const fetchUserTickets = async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        toast({
          title: "Error",
          description: "Please log in to view your tickets",
          variant: "destructive",
        });
        navigate({ to: "/auth" });
        return;
      }

      // Fetch user tickets along with their updates
      const { data, error } = await supabase
        .from("tickets")
        .select(
          `
          id,
          ticket_number,
          name,
          email,
          contact_number,
          department,
          issue_category,
          issue_description,
          priority,
          status,
          created_at,
          updated_at,
          ticket_updates (
            admin_notes,
            created_at,
            status_from,
            status_to
          )
        `,
        )
        .eq("created_by", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setTickets((data as Ticket[]) || []);
    } catch (error: any) {
      console.error("Error fetching tickets:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load tickets. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    applyFilters();
  }, [tickets, filters]);

  const applyFilters = () => {
    let filtered = tickets;

    if (filters.category !== "all") {
      filtered = filtered.filter((ticket) => ticket.issue_category === filters.category);
    }

    if (filters.status !== "all") {
      filtered = filtered.filter((ticket) => ticket.status === filters.status);
    }

    if (filters.priority !== "all") {
      filtered = filtered.filter((ticket) => ticket.priority === filters.priority);
    }

    setFilteredTickets(filtered);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200";
      case "in-progress":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200";
      case "waiting-for-user":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-200";
      case "resolved":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200";
      case "completed":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-200";
      case "procure-in-progress":
        return "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-200";
      case "procure-completed":
        return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-200";
      case "procure-approved":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200";
      case "procure-rejected":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200";
      case "service-approved":
        return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200";
      case "service-rejected":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "low":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200";
      case "medium":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200";
      case "high":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  // SLA color helper (matches admin dashboard fallback colors)
  const getSLAColor = (ticket: Ticket | null) => {
    if (!ticket) return "bg-gray-200 text-gray-800";
    switch (ticket.priority) {
      case "high":
        return "bg-red-600 text-white";
      case "medium":
        return "bg-yellow-400 text-black";
      case "low":
        return "bg-green-600 text-white";
      default:
        return "bg-gray-200 text-gray-800";
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto py-8 px-4">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>My Tickets</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  View and track the status of your raised tickets
                </p>
              </div>
              <Button onClick={() => navigate({ to: "/raise-ticket" })}>Raise New Ticket</Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-6">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-foreground">Status:</label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                  className="px-3 py-1 border border-border rounded-md text-sm bg-background text-foreground"
                >
                  <option value="all">All Statuses</option>
                  <option value="pending">Pending</option>
                  <option value="in-progress">In Progress</option>
                  <option value="waiting-for-user">Waiting for User</option>

                  <option value="completed">Completed</option>
                  <option value="procure-in-progress">Procure In Progress</option>
                  <option value="procure-completed">Procure Completed</option>
                  <option value="procure-approved">Procure Approved</option>
                  <option value="procure-rejected">Procure Rejected</option>
                </select>
              </div>
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-foreground">Priority:</label>
                <select
                  value={filters.priority}
                  onChange={(e) => setFilters((prev) => ({ ...prev, priority: e.target.value }))}
                  className="px-3 py-1 border border-border rounded-md text-sm bg-background text-foreground"
                >
                  <option value="all">All Priorities</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            {filteredTickets.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No tickets match your filters.</p>
                <Button className="mt-4" onClick={() => navigate({ to: "/raise-ticket" })}>
                  Raise New Ticket
                </Button>
              </div>
            ) : (
              <div className="space-y-6">
                {filteredTickets.map((ticket) => (
                  <Card key={ticket.id}>
                    <CardContent className="pt-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <h3 className="font-semibold">Ticket #{ticket.ticket_number}</h3>
                          <p className="text-sm text-muted-foreground">{ticket.issue_category}</p>
                        </div>
                        <div className="flex justify-end space-x-2">
                          <Badge className={getPriorityColor(ticket.priority)}>
                            {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                          </Badge>
                          <Badge className={getStatusColor(ticket.status)}>
                            {ticket.status
                              .replace("-", " ")
                              .replace(/\b\w/g, (l) => l.toUpperCase())}
                          </Badge>
                        </div>
                      </div>

                      <div className="mb-4">{renderTicketDescription(ticket)}</div>

                      <div className="text-sm text-muted-foreground mb-4">
                        <p>Created: {new Date(ticket.created_at).toLocaleString()}</p>
                        {ticket.updated_at !== ticket.created_at && (
                          <p>Last updated: {new Date(ticket.updated_at).toLocaleString()}</p>
                        )}
                      </div>

                      {/* Show admin updates (toggle per-ticket) */}
                      {ticket.ticket_updates && ticket.ticket_updates.length > 0 && (
                        <div>
                          <div className="flex justify-end mb-2 space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setOpenUpdateTicketId((prev) =>
                                  prev === ticket.id ? null : ticket.id,
                                )
                              }
                              aria-expanded={openUpdateTicketId === ticket.id}
                              aria-controls={`admin-updates-${ticket.id}`}
                            >
                              <EyeIcon className="w-4 h-4 mr-2" />
                              {openUpdateTicketId === ticket.id
                                ? "Hide Admin Updates"
                                : "View Admin Updates"}
                            </Button>

                            <Dialog
                              open={showDialog && viewTicket?.id === ticket.id}
                              onOpenChange={(open) => {
                                if (!open) {
                                  setShowDialog(false);
                                  setViewTicket(null);
                                }
                              }}
                            >
                              <DialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setViewTicket(ticket);
                                    setShowDialog(true);
                                  }}
                                >
                                  View Details
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Ticket #{viewTicket?.ticket_number}</DialogTitle>
                                  <DialogDescription>
                                    Full details for your request
                                  </DialogDescription>
                                </DialogHeader>

                                <div className="mt-2 space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="text-sm font-medium">Customer</p>
                                      <p className="text-sm text-muted-foreground">
                                        {viewTicket?.name}
                                      </p>
                                    </div>
                                    <span
                                      className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getSLAColor(viewTicket)}`}
                                    >
                                      {(viewTicket?.priority ?? "").charAt(0).toUpperCase() +
                                        (viewTicket?.priority ?? "").slice(1)}
                                    </span>
                                  </div>

                                  <div>
                                    <p className="text-sm font-medium">Device</p>
                                    <p className="text-sm text-muted-foreground">
                                      {viewTicket && viewTicket.issue_category === "procure"
                                        ? (
                                            formatProcureDescription(
                                              viewTicket.issue_description,
                                            ) as any
                                          )["Device Name"]
                                        : viewTicket?.issue_description}
                                    </p>
                                  </div>

                                  {viewTicket && viewTicket.issue_category === "procure" && (
                                    <div>
                                      <p className="text-sm font-medium">Quantity</p>
                                      <p className="text-sm text-muted-foreground">
                                        {
                                          formatProcureDescription(viewTicket.issue_description)[
                                            "Quantity"
                                          ]
                                        }
                                      </p>
                                      <p className="text-sm font-medium mt-2">Specifications</p>
                                      <p className="text-sm text-muted-foreground">
                                        {
                                          formatProcureDescription(viewTicket.issue_description)[
                                            "Specifications"
                                          ]
                                        }
                                      </p>
                                      <p className="text-sm font-medium mt-2">Estimated Cost</p>
                                      <p className="text-sm text-muted-foreground">
                                        ₹
                                        {
                                          formatProcureDescription(viewTicket.issue_description)[
                                            "Estimated Cost"
                                          ]
                                        }
                                      </p>
                                      <p className="text-sm font-medium mt-2">Justification</p>
                                      <p className="text-sm text-muted-foreground">
                                        {
                                          formatProcureDescription(viewTicket.issue_description)[
                                            "Justification"
                                          ]
                                        }
                                      </p>
                                    </div>
                                  )}

                                  <div>
                                    <p className="text-sm font-medium">SLA</p>
                                    <p className="text-sm text-muted-foreground">
                                      {viewTicket?.priority
                                        ? `${viewTicket.priority.charAt(0).toUpperCase() + viewTicket.priority.slice(1)}`
                                        : "—"}
                                    </p>
                                  </div>

                                  <div>
                                    <p className="text-sm font-medium">Created</p>
                                    <p className="text-sm text-muted-foreground">
                                      {viewTicket
                                        ? new Date(viewTicket.created_at).toLocaleString()
                                        : ""}
                                    </p>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>

                          {openUpdateTicketId === ticket.id && (
                            <div
                              id={`admin-updates-${ticket.id}`}
                              className="border rounded-lg p-4 bg-muted/30"
                            >
                              <h4 className="font-medium mb-2 flex items-center">
                                <CalendarIcon className="w-4 h-4 mr-2" />
                                Admin Updates
                              </h4>
                              <div className="space-y-3">
                                {ticket.ticket_updates.map((update, index) => (
                                  <div key={index} className="text-sm">
                                    {update.status_from && update.status_to && (
                                      <p>
                                        <span className="font-medium">Status:</span>{" "}
                                        {update.status_from.replace("-", " ")} →{" "}
                                        {update.status_to.replace("-", " ")}
                                      </p>
                                    )}
                                    {update.admin_notes && (
                                      <p>
                                        <span className="font-medium">Note:</span>{" "}
                                        {update.admin_notes}
                                      </p>
                                    )}
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(update.created_at).toLocaleString()}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default UserTickets;
