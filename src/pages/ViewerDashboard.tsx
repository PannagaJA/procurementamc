import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import ViewerTickets from "@/components/ViewerTickets";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as ReTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
} from "recharts";

interface ViewerStats {
  totalItems: number;
  totalValue: number;
  categoriesCount: number;
  locationsCount: number;
  locationBreakdown: { location: string; count: number }[];
  categoryBreakdown: { category: string; count: number }[];
}

const ViewerDashboard = () => {
  const navigate = useNavigate();
  const { primaryRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ViewerStats | null>(null);

  useEffect(() => {
    if (!primaryRole) return;
    if (primaryRole !== "viewer") navigate({ to: "/" });
  }, [primaryRole, navigate]);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      try {
        const [invRes, catRes, locRes] = await Promise.all([
          supabase
            .from("inventory")
            .select("quantity_available, total_cost, categories(name), locations(name, prefix)"),
          supabase.from("categories").select("id"),
          supabase.from("locations").select("id"),
        ]);

        const totalItems =
          invRes.data?.reduce((s: number, it: any) => s + (it.quantity_available || 0), 0) || 0;
        const totalValue =
          invRes.data?.reduce(
            (s: number, it: any) => s + parseFloat(String(it.total_cost || 0)),
            0,
          ) || 0;

        // Breakdown by location
        const locMap = new Map<string, number>();
        (invRes.data || []).forEach((it: any) => {
          const name = it.locations?.name || "Unassigned";
          const prefix = it.locations?.prefix ? ` (${it.locations.prefix})` : "";
          const key = `${name}${prefix}`;
          const cur = locMap.get(key) || 0;
          locMap.set(key, cur + (it.quantity_available || 0));
        });

        const locationBreakdown = Array.from(locMap.entries()).map(([location, count]) => ({
          location,
          count,
        }));

        // Category breakdown
        const catMap = new Map<string, number>();
        (invRes.data || []).forEach((it: any) => {
          const name = it.categories?.name || "Unassigned";
          const cur = catMap.get(name) || 0;
          catMap.set(name, cur + (it.quantity_available || 0));
        });
        const categoryBreakdown = Array.from(catMap.entries()).map(([category, count]) => ({
          category,
          count,
        }));

        setStats({
          totalItems,
          totalValue,
          categoriesCount: catRes.data?.length || 0,
          locationsCount: locRes.data?.length || 0,
          locationBreakdown,
          categoryBreakdown,
        });
      } catch (e) {
        console.error("Failed to load viewer dashboard data", e);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, []);

  if (loading) {
    return (
      <Layout>
        <div className="container mx-auto py-12 px-4">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
              <div className="h-24 bg-gray-200 rounded" />
              <div className="h-24 bg-gray-200 rounded" />
              <div className="h-24 bg-gray-200 rounded" />
              <div className="h-24 bg-gray-200 rounded" />
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto py-6 px-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">Viewer Dashboard</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Overview of your inventory system (read-only)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => navigate({ to: "/viewer/inventory" })}>
                  Inventory
                </Button>
                <Button variant="ghost" onClick={() => navigate({ to: "/viewer/quotations" })}>
                  Quotations
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="p-4 bg-white rounded shadow">
                <p className="text-sm text-muted-foreground">Total Items</p>
                <p className="text-2xl font-bold">{stats?.totalItems ?? 0}</p>
                <p className="text-sm text-muted-foreground">Across all locations</p>
              </div>
              <div className="p-4 bg-white rounded shadow">
                <p className="text-sm text-muted-foreground">Total Value</p>
                <p className="text-2xl font-bold">
                  ₹{parseFloat(String(stats?.totalValue || 0)).toLocaleString("en-IN")}
                </p>
                <p className="text-sm text-muted-foreground">Total inventory worth</p>
              </div>
              <div className="p-4 bg-white rounded shadow">
                <p className="text-sm text-muted-foreground">Categories</p>
                <p className="text-2xl font-bold">{stats?.categoriesCount ?? 0}</p>
                <p className="text-sm text-muted-foreground">Item categories</p>
              </div>
              <div className="p-4 bg-white rounded shadow">
                <p className="text-sm text-muted-foreground">Locations</p>
                <p className="text-2xl font-bold">{stats?.locationsCount ?? 0}</p>
                <p className="text-sm text-muted-foreground">Storage locations</p>
              </div>
            </div>

            <div className="mt-6 grid md:grid-cols-2 gap-6">
              <div className="p-4 bg-white rounded shadow">
                <h3 className="font-medium">Categories (by item count)</h3>
                <div style={{ width: "100%", height: 240 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <ReTooltip />
                      <Pie
                        data={stats?.categoryBreakdown || []}
                        dataKey="count"
                        nameKey="category"
                        outerRadius={80}
                        innerRadius={40}
                        paddingAngle={3}
                      >
                        {(stats?.categoryBreakdown || []).map((entry, idx) => (
                          <Cell
                            key={`cell-${idx}`}
                            fill={CHART_COLORS[idx % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="p-4 bg-white rounded shadow">
                <h3 className="font-medium">Inventory by Location</h3>
                <div style={{ width: "100%", height: 240 }}>
                  <ResponsiveContainer>
                    <BarChart
                      data={stats?.locationBreakdown || []}
                      margin={{ top: 10, right: 10, left: -10, bottom: 20 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="location" tick={{ fontSize: 12 }} interval={0} />
                      <YAxis />
                      <ReTooltip />
                      <Legend />
                      <Bar dataKey="count" fill={CHART_COLORS[0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <ViewerTickets />
      </div>
    </Layout>
  );
};

const CHART_COLORS = ["#4F46E5", "#06B6D4", "#F97316", "#10B981", "#EF4444", "#8B5CF6", "#F59E0B"];

export default ViewerDashboard;
