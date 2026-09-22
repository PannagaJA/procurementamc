import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const ViewerQuotations = () => {
  const { toast } = useToast();
  const [selected, setSelected] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  const extractPhoneFromText = (text: string | undefined) => {
    if (!text) return null;
    const m = text.match(/Contact Phone:\s*([^\n\r]+)/i);
    return m ? m[1].trim() : null;
  };

  const { data: quotations } = useQuery({
    queryKey: ["quotations-viewer"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotations")
        .select(
          `
          *,
          categories(name),
          quotation_responses (description, total_amount, submitted_at)
        `,
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const grouped = useMemo(() => {
    if (!quotations) return {};
    return quotations.reduce(
      (acc: any, q: any) => {
        const key = q.category_id || "uncat";
        if (!acc[key]) acc[key] = { category: q.categories, quotations: [] };
        acc[key].quotations.push(q);
        return acc;
      },
      {} as Record<string, any>,
    );
  }, [quotations]);

  return (
    <Layout>
      <div className="container mx-auto py-6 px-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">Quotation Requests</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Quotations requested by admin — read-only
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {Object.keys(grouped).length === 0 ? (
              <div className="text-sm text-muted-foreground">No quotations found.</div>
            ) : (
              Object.values(grouped).map((g: any) => (
                <div key={g.category?.id || Math.random()} className="mb-4">
                  <h3 className="font-medium">{g.category?.name || "Uncategorized"}</h3>
                  <div className="mt-2 space-y-2">
                    {g.quotations.map((q: any) => (
                      <div
                        key={q.id}
                        className="p-3 border rounded flex items-center justify-between"
                      >
                        <div>
                          <div className="font-medium">
                            {q.product_name} • {q.quantity}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Requested: {new Date(q.created_at).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelected(q);
                              setOpen(true);
                            }}
                          >
                            View
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Quotation Details</DialogTitle>
                  <DialogDescription>Read-only view of quotation and responses</DialogDescription>
                </DialogHeader>

                {!selected ? (
                  <div className="py-4">Loading...</div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <div className="text-sm font-medium">Product</div>
                      <div className="text-base">
                        {selected.product_name} • {selected.quantity}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Company</div>
                      <div className="text-base">{selected.company_email || "N/A"}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Last Reply Date</div>
                      <div className="text-base">
                        {selected.last_reply_date
                          ? new Date(selected.last_reply_date).toLocaleString()
                          : "N/A"}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Status</div>
                      <div className="text-base">
                        <Badge
                          variant={selected.status === "responded" ? "default" : "secondary"}
                          className="text-sm px-3 py-1"
                        >
                          {(selected.status || "Unknown").toString().charAt(0).toUpperCase() +
                            (selected.status || "").toString().slice(1)}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Admin Status</div>
                      <div className="text-base">
                        <Badge
                          variant={
                            selected.admin_status === "accepted"
                              ? "default"
                              : selected.admin_status === "rejected"
                                ? "destructive"
                                : "secondary"
                          }
                          className="text-sm px-3 py-1"
                        >
                          {(selected.admin_status || "Unknown").toString().charAt(0).toUpperCase() +
                            (selected.admin_status || "").toString().slice(1)}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium">Contact Phone</div>
                      <div className="text-base">
                        {(() => {
                          // Try to find phone in quotation (if stored) or first response
                          const phoneFromQuotation = (selected.contact_phone as string) || null;
                          const phoneFromResponse = extractPhoneFromText(
                            selected.quotation_responses &&
                              selected.quotation_responses[0] &&
                              selected.quotation_responses[0].description,
                          );
                          const phone = phoneFromQuotation || phoneFromResponse;
                          if (!phone) return "N/A";
                          const tel = phone.replace(/[^0-9+]/g, "");
                          return (
                            <a className="text-blue-600 underline" href={`tel:${tel}`}>
                              {phone}
                            </a>
                          );
                        })()}
                      </div>
                    </div>

                    <div>
                      <div className="text-sm font-medium">Request Description</div>
                      <div className="bg-gray-50 p-3 rounded mt-1 text-sm whitespace-pre-line">
                        {selected.description}
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium">Responses</h4>
                      {selected.quotation_responses && selected.quotation_responses.length > 0 ? (
                        <div className="space-y-3 mt-2">
                          {selected.quotation_responses.map((r: any) => (
                            <div
                              key={r.id}
                              className={`p-3 rounded ${selected.admin_status === "accepted" ? "bg-green-50 border border-green-200" : "border"}`}
                            >
                              <div className="text-sm font-medium">
                                Company: {r.company_email || selected.company_email}
                              </div>
                              <div className="text-sm">Total Amount: ₹{r.total_amount}</div>
                              <div className="text-sm">
                                Submitted:{" "}
                                {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : "N/A"}
                              </div>
                              <div className="mt-2 text-sm whitespace-pre-line">
                                {r.description}
                              </div>
                              <div className="mt-2">
                                {(() => {
                                  const phone = extractPhoneFromText(r.description);
                                  if (!phone) return null;
                                  const tel = phone.replace(/[^0-9+]/g, "");
                                  return (
                                    <div className="text-sm mt-2">
                                      Contact Phone:{" "}
                                      <a className="text-blue-600 underline" href={`tel:${tel}`}>
                                        {phone}
                                      </a>
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground mt-2">No responses yet.</div>
                      )}
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default ViewerQuotations;
