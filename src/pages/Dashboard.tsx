import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import Layout from "@/components/Layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import QRScanner from "@/components/QRScanner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScanLine, Ticket, PlusCircle, ArrowUpRight, LifeBuoy } from "lucide-react";

interface DashboardStats {
  totalItems: number;
  totalValue: number;
  categoriesCount: number;
  locationsCount: number;
  recentItems: any[];
  allItems: any[];
  categoryBreakdown: { category: string; count: number; value: number }[];
  locationBreakdown: { location: string; count: number; value: number; building: string }[];
  ticketStats: {
    total: number;
    pending: number;
    inProgress: number;
    resolved: number;
  };
  recentTickets: any[];
}

const Dashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const [showQRScanner, setShowQRScanner] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filteredItems, setFilteredItems] = useState<any[]>([]);

  // Check user role and redirect accordingly
  const { primaryRole } = useAuth();

  useEffect(() => {
    // If auth hasn't loaded yet, don't redirect
    if (!primaryRole) return;

    // Redirect based on primary role
    switch (primaryRole) {
      case "admin":
        // keep the main dashboard for admins
        break;
      case "hod":
        navigate({ to: "/hod" });
        return;
      case "principle":
        navigate({ to: "/principal" });
        return;
      case "librarian":
        navigate({ to: "/librarian" });
        return;
      case "viewer":
        navigate({ to: "/viewer" });
        return;
      default:
        break;
    }
  }, [primaryRole, navigate]);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const [inventoryResult, categoriesResult, locationsResult, ticketsResult, allTicketsRes] =
        await Promise.all([
          supabase
            .from("inventory")
            .select(
              "quantity_available, total_cost, status, categories(name), locations(name, prefix)",
            ),
          supabase.from("categories").select("id"),
          supabase.from("locations").select("id"),
          supabase
            .from("tickets")
            .select(
              "id, ticket_number, name, department, issue_category, priority, status, created_at",
            )
            .order("created_at", { ascending: false })
            .limit(5),
          supabase.from("tickets").select("status"),
        ]);

      const totalItems =
        inventoryResult.data?.reduce((sum, item) => sum + (item.quantity_available || 0), 0) || 0;

      const totalValue =
        inventoryResult.data?.reduce(
          (sum, item) => sum + parseFloat(String(item.total_cost || 0)),
          0,
        ) || 0;

      // Category breakdown
      const categoryMap = new Map<string, { count: number; value: number }>();
      inventoryResult.data?.forEach((item) => {
        const category = (item.categories as any)?.name || "Unassigned";
        const existing = categoryMap.get(category) || { count: 0, value: 0 };
        categoryMap.set(category, {
          count: existing.count + (item.quantity_available || 0),
          value: existing.value + parseFloat(String(item.total_cost || 0)),
        });
      });
      const categoryBreakdown = Array.from(categoryMap.entries()).map(([category, data]) => ({
        category,
        count: data.count,
        value: data.value,
      }));

      // Location breakdown
      const locationMap = new Map<string, { count: number; value: number; building: string }>();
      inventoryResult.data?.forEach((item) => {
        const locName = (item.locations as any)?.name || "Unassigned";
        const locPrefix = (item.locations as any)?.prefix
          ? ` (${(item.locations as any).prefix})`
          : "";
        const location = `${locName}${locPrefix}`;
        // Access building safely, defaulting to Unknown if not available
        const building =
          item.locations && typeof item.locations === "object" && "building" in item.locations
            ? (item.locations as any).building || "Unknown"
            : "Unknown";
        const existing = locationMap.get(location) || { count: 0, value: 0, building: "Unknown" };
        locationMap.set(location, {
          count: existing.count + (item.quantity_available || 0),
          value: existing.value + parseFloat(String(item.total_cost || 0)),
          building,
        });
      });
      const locationBreakdown = Array.from(locationMap.entries()).map(([location, data]) => ({
        location,
        count: data.count,
        value: data.value,
        building: data.building,
      }));

      // Ticket metrics
      const allTickets = allTicketsRes.data || [];
      const ticketStats = {
        total: allTickets.length,
        pending: allTickets.filter((t) => t.status === "pending" || t.status === "pending_principal")
          .length,
        inProgress: allTickets.filter((t) => t.status === "in-progress" || t.status.startsWith("procure"))
          .length,
        resolved: allTickets.filter(
          (t) => t.status === "resolved" || t.status === "completed" || t.status === "procure-completed",
        ).length,
      };

      setStats({
        totalItems,
        totalValue,
        categoriesCount: categoriesResult.data?.length || 0,
        locationsCount: locationsResult.data?.length || 0,
        recentItems: [],
        allItems: [],
        categoryBreakdown,
        locationBreakdown,
        ticketStats,
        recentTickets: ticketsResult.data || [],
      });
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const filterItems = () => {
    if (!stats?.allItems) return;

    if (!searchTerm.trim()) {
      setFilteredItems([]);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = stats.allItems.filter(
      (item) =>
        item.item_code?.toLowerCase().includes(term) ||
        item.item_name?.toLowerCase().includes(term) ||
        item.department?.toLowerCase().includes(term) ||
        item.categories?.name?.toLowerCase().includes(term) ||
        (item.locations?.name || "").toLowerCase().includes(term) ||
        (item.locations?.prefix || "").toLowerCase().includes(term),
    );

    setFilteredItems(filtered);
  };

  const clearSearch = () => {
    setSearchTerm("");
    setFilteredItems([]);
  };

  const handleQRScan = (result: string) => {
    setShowQRScanner(false);

    // Handle both direct item codes and URLs containing item codes
    let itemCode = result;

    // If it's a URL, extract the item code from the path
    if (result.includes("/inventory/")) {
      const urlParts = result.split("/inventory/");
      if (urlParts.length > 1) {
        itemCode = urlParts[1].split("/")[0]; // Get the ID part
        // If it's an ID, we need to find the item by ID instead
        const foundItem = stats?.allItems.find((item) => item.id === itemCode);
        if (foundItem) {
          navigate({ to: `/inventory/${foundItem.id}` });
          return;
        }
      }
    }

    // Search for the item with the scanned QR code (item_code)
    const foundItem = stats?.allItems.find((item) => item.item_code === itemCode);
    if (foundItem) {
      navigate({ to: `/inventory/${foundItem.id}` });
    } else {
      // If not found in dashboard items, redirect to inventory page with search
      navigate({ to: `/inventory?search=${encodeURIComponent(itemCode)}` });
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-8 animate-in fade-in-0 duration-500">
          <div className="text-center">
            <h2 className="text-4xl font-bold tracking-tight text-foreground mb-2">Dashboard</h2>
            <p className="text-muted-foreground text-lg">Overview of your inventory system</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Card
                key={i}
                className="bg-white/80 backdrop-blur-sm shadow-lg border-0 rounded-xl transition-all duration-300 hover:shadow-xl"
              >
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <Skeleton className="h-5 w-28" />
                  <Skeleton className="h-5 w-5 rounded-full" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-9 w-24 mb-2" />
                  <Skeleton className="h-4 w-36" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8 animate-in slide-in-from-bottom duration-700">
        <div className="text-center">
          <h2 className="text-4xl font-bold tracking-tight text-foreground mb-2">Dashboard</h2>
          <p className="text-muted-foreground text-lg">Overview of your inventory system</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950/20 dark:to-blue-900/20 shadow-lg border-0 rounded-xl transition-all duration-300 hover:shadow-xl hover:scale-105">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base font-semibold text-blue-800 dark:text-blue-200">
                Total Items
              </CardTitle>
              <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                {stats?.totalItems || 0}
              </div>
              <p className="text-sm text-blue-700 dark:text-blue-300">Across all locations</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/20 dark:to-green-900/20 shadow-lg border-0 rounded-xl transition-all duration-300 hover:shadow-xl hover:scale-105">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base font-semibold text-green-800 dark:text-green-200">
                Total Value
              </CardTitle>
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-900 dark:text-green-100">
                ₹{(stats?.totalValue || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </div>
              <p className="text-sm text-green-700 dark:text-green-300">Total inventory worth</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-950/20 dark:to-purple-900/20 shadow-lg border-0 rounded-xl transition-all duration-300 hover:shadow-xl hover:scale-105">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base font-semibold text-purple-800 dark:text-purple-200">
                Categories
              </CardTitle>
              <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-900 dark:text-purple-100">
                {stats?.categoriesCount || 0}
              </div>
              <p className="text-sm text-purple-700 dark:text-purple-300">Item categories</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/20 dark:to-orange-900/20 shadow-lg border-0 rounded-xl transition-all duration-300 hover:shadow-xl hover:scale-105">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-base font-semibold text-orange-800 dark:text-orange-200">
                Locations
              </CardTitle>
              <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-orange-900 dark:text-orange-100">
                {stats?.locationsCount || 0}
              </div>
              <p className="text-sm text-orange-700 dark:text-orange-300">Storage locations</p>
            </CardContent>
          </Card>
        </div>

        {/* Search UI removed per request */}

        <Card className="bg-card/90 backdrop-blur-sm shadow-xl border-0 rounded-xl transition-all duration-300 hover:shadow-2xl">
          <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-t-xl">
            <CardTitle className="text-2xl font-bold text-card-foreground flex items-center gap-2">
              <ScanLine className="w-6 h-6 text-green-600 dark:text-green-400" />
              Scan to Get Info
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Scan QR codes to quickly access item details
            </p>
          </CardHeader>
          <CardContent className="p-8">
            <div className="text-center">
              <Button
                onClick={() => setShowQRScanner(true)}
                className="bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 text-white px-8 py-4 rounded-lg font-medium transition-all duration-300 hover:scale-105 hover:shadow-lg text-lg"
                size="lg"
              >
                <ScanLine className="w-5 h-5 mr-2" />
                Scan QR Code
              </Button>
              <p className="text-sm text-muted-foreground mt-3">
                Use your camera to scan QR codes on inventory items
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Campus Tickets & Maintenance Overview */}
        <Card className="bg-card/90 backdrop-blur-sm shadow-xl border-0 rounded-xl transition-all duration-300 hover:shadow-2xl">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/40">
            <div>
              <CardTitle className="text-xl font-bold text-card-foreground flex items-center gap-2">
                <LifeBuoy className="w-5 h-5 text-indigo-500" />
                Tickets & Maintenance Overview
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Track and manage campus support, service, and procurement tickets
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate({ to: "/raise-ticket" })}
                className="gap-1.5"
              >
                <PlusCircle className="w-4 h-4" />
                Raise Ticket
              </Button>
              <Button
                size="sm"
                onClick={() => navigate({ to: "/admin/tickets" })}
                className="gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                <Ticket className="w-4 h-4" />
                Manage All Tickets
                <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            {/* Quick Stats Badges */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
              <div className="p-4 rounded-lg bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/50 dark:border-blue-900/30">
                <span className="text-xs text-muted-foreground">Total Tickets</span>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                  {stats?.ticketStats?.total ?? 0}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30">
                <span className="text-xs text-muted-foreground">Pending / Needs Action</span>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                  {stats?.ticketStats?.pending ?? 0}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/50 dark:border-purple-900/30">
                <span className="text-xs text-muted-foreground">In Progress</span>
                <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                  {stats?.ticketStats?.inProgress ?? 0}
                </p>
              </div>
              <div className="p-4 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/30">
                <span className="text-xs text-muted-foreground">Resolved / Completed</span>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                  {stats?.ticketStats?.resolved ?? 0}
                </p>
              </div>
            </div>

            {/* Recent Tickets Table */}
            <div className="overflow-x-auto rounded-lg border border-border/50">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground font-semibold">
                  <tr>
                    <th className="px-3 py-2.5 text-left">Ticket #</th>
                    <th className="px-3 py-2.5 text-left">Reporter</th>
                    <th className="px-3 py-2.5 text-left">Department</th>
                    <th className="px-3 py-2.5 text-left">Category</th>
                    <th className="px-3 py-2.5 text-left">Priority</th>
                    <th className="px-3 py-2.5 text-left">Status</th>
                    <th className="px-3 py-2.5 text-left">Created</th>
                    <th className="px-3 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {!stats?.recentTickets || stats.recentTickets.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-muted-foreground text-xs">
                        No tickets raised yet.
                      </td>
                    </tr>
                  ) : (
                    stats.recentTickets.map((t) => (
                      <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2.5 font-mono font-semibold text-foreground">
                          {t.ticket_number || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-foreground">{t.name || "—"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{t.department || "—"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">{t.issue_category || "—"}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${
                              t.priority === "high"
                                ? "bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-400"
                                : t.priority === "medium"
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                            }`}
                          >
                            {t.priority}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${
                              t.status === "completed" || t.status === "resolved"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                                : t.status === "in-progress"
                                  ? "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400"
                                  : "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400"
                            }`}
                          >
                            {t.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(t.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-7 px-2"
                            onClick={() => navigate({ to: "/admin/tickets" })}
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Section */}
      <div className="grid md:grid-cols-2 gap-8 mt-8 animate-in fade-in-0 duration-1000">
        <Card className="bg-card/90 backdrop-blur-sm shadow-xl border-0 rounded-xl transition-all duration-300 hover:shadow-2xl">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-card-foreground">
              Inventory by Location
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.locationBreakdown || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="location"
                    angle={-45}
                    textAnchor="end"
                    height={80}
                    fontSize={12}
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    formatter={(value, name) => [
                      name === "count" ? `${value} items` : `₹${value.toLocaleString("en-IN")}`,
                      name === "count" ? "Items" : "Value",
                    ]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                      color: "hsl(var(--foreground))",
                    }}
                  />
                  <Bar
                    dataKey="count"
                    fill="hsl(var(--primary))"
                    name="count"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/90 backdrop-blur-sm shadow-xl border-0 rounded-xl transition-all duration-300 hover:shadow-2xl">
          <CardHeader>
            <CardTitle className="text-xl font-bold text-card-foreground">
              Location Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats?.locationBreakdown || []}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ location, count }) => `${location}: ${count}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {stats?.locationBreakdown?.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={`hsl(${index * 45 + 200}, 70%, 50%)`} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [`${value} items`, "Count"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      boxShadow: "0 10px 25px rgba(0,0,0,0.1)",
                      color: "hsl(var(--foreground))",
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showQRScanner} onOpenChange={setShowQRScanner}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan QR Code</DialogTitle>
          </DialogHeader>
          <QRScanner onScan={handleQRScan} onClose={() => setShowQRScanner(false)} />
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default Dashboard;
