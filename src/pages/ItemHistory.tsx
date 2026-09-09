import { useEffect, useState } from "react";
import { useParams, useNavigate } from '@tanstack/react-router';
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Clock, User, FileText } from "lucide-react";
import { format } from "date-fns";

interface HistoryItem {
  id: string;
  action_type: string;
  old_value: any;
  new_value: any;
  changed_by: string | null;
  change_reason: string | null;
  created_at: string;
  profiles?: { full_name: string; email: string } | null;
}

interface InventoryItem {
  id: string;
  item_code: string;
  item_name: string;
  status: string;
  categories: { name: string } | null;
  locations: { name: string; prefix?: string } | null;
  asset_type?: string;
}

const ItemHistory = () => {
  const { id } = useParams({ strict: false }) as { id: string };
  const navigate = useNavigate();
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchItemAndHistory();
    }
  }, [id]);

  const fetchItemAndHistory = async () => {
    setLoading(true);
    try {
      // Fetch item details
      const { data: itemData, error: itemError } = await supabase
        .from("inventory")
        .select(`
          id,
          item_code,
          item_name,
          status,
          asset_type,
          categories(name),
          locations(name, prefix)
        `)
        .eq("id", id)
        .single();

      if (itemError) throw itemError;
      setItem(itemData as any);

      // Fetch history
      const { data: historyData, error: historyError } = await supabase
        .from("inventory_history")
        .select(`
          *,
          profiles(full_name, email)
        `)
        .eq("inventory_id", id)
        .order("created_at", { ascending: false });

      if (historyError) throw historyError;
      setHistory(historyData || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getActionBadge = (actionType: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      "created": "default",
      "updated": "secondary",
      "status_changed": "outline",
      "location_changed": "outline",
      "quantity_changed": "outline",
      "deleted": "destructive",
    };

    return (
      <Badge variant={variants[actionType] || "default"}>
        {actionType.replace("_", " ").toUpperCase()}
      </Badge>
    );
  };

  const formatChangeDetails = (historyItem: HistoryItem) => {
    const { action_type, old_value, new_value } = historyItem;

    switch (action_type) {
      case "created":
        return "Item was created";
      case "deleted":
        return "Item was deleted";
      case "status_changed":
        return `Status changed from "${old_value?.status}" to "${new_value?.status}"`;
      case "location_changed":
        return `Location changed from "${old_value?.location_id}" to "${new_value?.location_id}"`;
      case "quantity_changed":
        return `Quantity changed from ${old_value?.quantity_available} to ${new_value?.quantity_available}`;
      default:
        return "Item was updated";
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-10" />
            <div>
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  if (!item) {
    return (
      <Layout>
        <div className="text-center py-12">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Item Not Found</h2>
          <p className="text-gray-600">The requested item could not be found.</p>
          <Button onClick={() => navigate({ to: "/inventory" })} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Inventory
          </Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 animate-in fade-in-0 duration-700">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/inventory" })}
            className="hover:bg-gray-100"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-gray-800">
              {item.item_name}
            </h2>
            <p className="text-gray-600 text-lg">
              Item Code: {item.item_code}
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Item Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-600">Category</label>
                <p className="text-base">{item.categories?.name || "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Location</label>
                <p className="text-base">{item.locations ? `${item.locations.name}${item.locations.prefix ? ` (${item.locations.prefix})` : ''}` : "N/A"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Asset Type</label>
                <p className="text-base">{item.asset_type === 'capital' ? 'Capital' : item.asset_type === 'recurring' ? 'Recurring/Consumables' : 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Status</label>
                <div className="mt-1">
                  <Badge variant={item.status === "in-use" ? "default" : "secondary"}>
                    {item.status.replace("-", " ").toUpperCase()}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Change History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No history records found for this item.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {history.map((historyItem) => (
                    <div
                      key={historyItem.id}
                      className="border rounded-lg p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {getActionBadge(historyItem.action_type)}
                          <span className="text-sm text-gray-500">
                            {format(new Date(historyItem.created_at), "PPp")}
                          </span>
                        </div>
                      </div>
                      <p className="text-base mb-2">
                        {formatChangeDetails(historyItem)}
                      </p>
                      {historyItem.profiles && (
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <User className="w-4 h-4" />
                          <span>
                            {historyItem.profiles.full_name || historyItem.profiles.email}
                          </span>
                        </div>
                      )}
                      {historyItem.change_reason && (
                        <div className="mt-2 text-sm text-gray-600">
                          <strong>Reason:</strong> {historyItem.change_reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
};

export default ItemHistory;