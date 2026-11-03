import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/use-pagination";
import { PaginationControls } from "@/components/PaginationControls";
import { inventoryApi } from "@/lib/inventoryApi";
import { useAuth } from "@/lib/auth";

const HodInventory = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { departmentId } = useAuth();

  const [departmentName, setDepartmentName] = useState<string | null>(null);
  const { pagination, setPage, setPageSize, setTotal } = usePagination(12, 1);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchDepartment = useCallback(async () => {
    try {
      if (departmentId) {
        const { data: dept } = await supabase
          .from("departments")
          .select("name")
          .eq("id", departmentId)
          .maybeSingle();
        setDepartmentName((dept as any)?.name ?? null);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("department_id")
        .eq("user_id", user.id)
        .eq("role", "hod")
        .maybeSingle();
      const deptId = (roleData as any)?.department_id;
      if (!deptId) return;
      const { data: dept } = await supabase
        .from("departments")
        .select("name")
        .eq("id", deptId)
        .maybeSingle();
      setDepartmentName((dept as any)?.name ?? null);
    } catch (err) {
      console.error("Failed to fetch department for HOD inventory", err);
      toast({
        title: "Error",
        description: "Failed to determine your department",
        variant: "destructive",
      });
    }
  }, [departmentId, toast]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      if (!departmentName) {
        setItems([]);
        setTotal(0);
        return;
      }
      const limit = pagination.pageSize;
      const offset = (pagination.page - 1) * pagination.pageSize;
      const { data, count } = await inventoryApi.getInventoryItems({
        limit,
        offset,
        departmentId: departmentName,
      });
      setItems(data || []);
      setTotal(count || 0);
    } catch (err) {
      console.error("Failed to fetch HOD inventory items", err);
      toast({ title: "Error", description: "Failed to load inventory", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [departmentName, pagination.page, pagination.pageSize, setTotal, toast]);

  useEffect(() => {
    fetchDepartment();
  }, [fetchDepartment]);
  useEffect(() => {
    if (departmentName) fetchItems();
  }, [departmentName, fetchItems]);

  return (
    <Layout>
      <div className="w-full space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-600" /> HOD Inventory
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  Inventory for {departmentName || "your department"}
                </p>
              </div>
              <div>
                <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/hod" })}>
                  Back to Dashboard
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3 p-4">{[...Array(5)].map((_, i) => (<div key={i} className="h-12 w-full bg-muted/60 animate-pulse rounded-xl" />))}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[650px] table-fixed">
                  <colgroup>
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "10%" }} />
                  </colgroup>
                  <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="px-2 py-3 text-left">Item Code</th>
                      <th className="px-2 py-3 text-left">Name</th>
                      <th className="px-2 py-3 text-left">Category</th>
                      <th className="px-2 py-3 text-left">Department</th>
                      <th className="px-2 py-3 text-left">Location</th>
                      <th className="px-2 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-t">
                        <td className="px-2 py-2 align-middle">
                          <div className="whitespace-normal break-words">{it.item_code}</div>
                        </td>
                        <td className="px-2 py-2 align-middle">
                          <div className="whitespace-normal break-words">{it.item_name}</div>
                        </td>
                        <td className="px-2 py-2 align-middle">
                          {(it.categories && it.categories.name) || it.category_name || "-"}
                        </td>
                        <td className="px-2 py-2 align-middle">{it.department || "-"}</td>
                        <td className="px-2 py-2 align-middle">
                          {(it.locations && it.locations.name) || it.location_name || "-"}
                        </td>
                        <td className="px-2 py-2 align-middle text-right">
                          <Button
                            size="sm"
                            onClick={() =>
                              navigate({
                                to: `/hod/inventory/${it.id}`,
                                state: { from: "hod-inventory" } as any,
                              })
                            }
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center">
                          <div className="flex flex-col items-center justify-center text-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 mb-3 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6M3 21h18M3 10.5L12 3l9 7.5" />
                            </svg>
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 mb-1">
                              No data found
                            </span>
                            <p className="text-sm text-slate-400 mt-1">No inventory items found for your department.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4">
              <PaginationControls
                currentPage={pagination.page}
                totalPages={Math.max(1, Math.ceil(pagination.total / pagination.pageSize))}
                pageSize={pagination.pageSize}
                totalItems={pagination.total}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default HodInventory;
