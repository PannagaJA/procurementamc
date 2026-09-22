import { useQuery } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/inventoryApi";
import Layout from "@/components/Layout";
import { useParams, useNavigate, useLocation } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  MapPin,
  Package,
  DollarSign,
  Calendar,
  FileText,
  Download,
  Printer,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface InventoryDetail {
  id: string;
  sl_no: number;
  item_code: string;
  item_name: string;
  specifications: string | null;
  quantity_available: number;
  item_photo_url: string | null;
  approval_letter_ref: string | null;
  approval_letter_date: string | null;
  approval_letter_photo_url: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  vendor_name: string | null;
  vendor_address: string | null;
  vendor_contact: string | null;
  invoice_photo_url: string | null;
  cost_per_unit: number;
  total_cost: number;
  department: string | null;
  room_no: string | null;
  asset_type?: string | null;
  gps_latitude: number | null;
  gps_longitude: number | null;
  status: string;
  remarks: string | null;
  qr_code_url: string | null;
  created_at: string;
  categories: { name: string; prefix: string } | null;
  locations: { name: string; prefix?: string; building: string } | null;
}

const ItemDetails = () => {
  const { id } = useParams({ strict: false }) as { id: string };
  const navigate = useNavigate();
  const { toast } = useToast();
  const location = useLocation();

  const { data: item, isLoading } = useQuery({
    queryKey: ["inventory-item", id],
    queryFn: () => inventoryApi.getInventoryItem(id!),
    enabled: !!id,
  });

  const downloadQRCode = async () => {
    if (!item?.qr_code_url) return;

    try {
      // Fetch the QR code image
      const response = await fetch(item.qr_code_url);
      const blob = await response.blob();

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${item.item_code}-qrcode.png`;

      // Trigger download
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Download started",
        description: "QR code image has been downloaded.",
      });
    } catch (error) {
      console.error("Error downloading QR code:", error);
      toast({
        variant: "destructive",
        title: "Download failed",
        description: "Failed to download QR code image.",
      });
    }
  };

  const printQRCode = () => {
    if (!item?.qr_code_url) return;

    try {
      // Open a new window with just the QR code for printing
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        toast({
          variant: "destructive",
          title: "Print failed",
          description: "Unable to open print window. Please check your popup blocker.",
        });
        return;
      }

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>QR Code - ${item.item_code}</title>
            <style>
              body {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                margin: 0;
                padding: 20px;
                font-family: Arial, sans-serif;
              }
              .qr-container {
                text-align: center;
                margin-bottom: 20px;
              }
              .qr-code {
                max-width: 300px;
                max-height: 300px;
                border: 1px solid #ccc;
                border-radius: 8px;
              }
              .item-info {
                margin-top: 20px;
                font-size: 14px;
                color: #666;
              }
              @media print {
                body { margin: 0; }
                .qr-code { max-width: 200px; max-height: 200px; }
              }
            </style>
          </head>
          <body>
            <div class="qr-container">
              <img src="${item.qr_code_url}" alt="QR Code" class="qr-code" />
            </div>
            <div class="item-info">
              <p><strong>Item Code:</strong> ${item.item_code}</p>
              <p><strong>Item Name:</strong> ${item.item_name}</p>
              <p><strong>Scan this QR code to view item details</strong></p>
            </div>
          </body>
        </html>
      `);

      printWindow.document.close();
      printWindow.focus();

      // Wait a bit for the image to load, then print
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);

      toast({
        title: "Print initiated",
        description: "QR code print dialog has been opened.",
      });
    } catch (error) {
      console.error("Error printing QR code:", error);
      toast({
        variant: "destructive",
        title: "Print failed",
        description: "Failed to print QR code.",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      "in-use": "default",
      discarded: "secondary",
      scrapped: "destructive",
      transferred: "outline",
    };

    return (
      <Badge variant={variants[status] || "default"} className="text-sm">
        {status.replace("-", " ").toUpperCase()}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-full max-w-xs" />
          <div className="grid md:grid-cols-2 gap-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      </Layout>
    );
  }

  if (!item) return null;

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const from =
                (location && (location as any).state && (location as any).state.from) || null;
              if (from === "hod-dashboard") return navigate({ to: "/hod" });
              if (from === "hod-inventory") return navigate({ to: "/hod/inventory" });
              return navigate({ to: "/inventory" });
            }}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Inventory
          </Button>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{item.item_name}</h2>
            <p className="text-muted-foreground mt-1">
              <span className="font-mono text-primary">{item.item_code}</span> • Sl. No:{" "}
              {item.sl_no}
            </p>
          </div>
          {getStatusBadge(item.status)}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Basic Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Category</p>
                <p className="text-base">
                  {item.categories ? `${item.categories.name} (${item.categories.prefix})` : "-"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Location/Building</p>
                <p className="text-base">
                  {item.locations
                    ? `${item.locations.name}${item.locations.prefix ? ` (${item.locations.prefix})` : ""} - ${item.locations.building}`
                    : "-"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Department</p>
                <p className="text-base">{item.department || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Asset Type</p>
                <p className="text-base">
                  {item.asset_type === "capital"
                    ? "Capital"
                    : item.asset_type === "recurring"
                      ? "Recurring/Consumables"
                      : "-"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Room Number</p>
                <p className="text-base">{item.room_no || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Specifications</p>
                <p className="text-base">{item.specifications || "-"}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Cost Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Quantity Available</p>
                <p className="text-2xl font-bold">{item.quantity_available}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Cost per Unit</p>
                <p className="text-base">
                  ₹{parseFloat(String(item.cost_per_unit)).toLocaleString("en-IN")}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Cost</p>
                <p className="text-2xl font-bold text-primary">
                  ₹{parseFloat(String(item.total_cost || 0)).toLocaleString("en-IN")}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Vendor & Invoice Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Vendor Name</p>
                <p className="text-base">{item.vendor_name || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Vendor Contact</p>
                <p className="text-base">{item.vendor_contact || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Vendor Address</p>
                <p className="text-base">{item.vendor_address || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Invoice Number</p>
                <p className="text-base">{item.invoice_no || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Invoice Date</p>
                <p className="text-base">
                  {item.invoice_date ? new Date(item.invoice_date).toLocaleDateString() : "-"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Approval & Documentation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Approval Letter Reference
                </p>
                <p className="text-base">{item.approval_letter_ref || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Approval Date</p>
                <p className="text-base">
                  {item.approval_letter_date
                    ? new Date(item.approval_letter_date).toLocaleDateString()
                    : "-"}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Remarks</p>
                <p className="text-base">{item.remarks || "-"}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Added On</p>
                <p className="text-base">{new Date(item.created_at).toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {(item.gps_latitude || item.gps_longitude) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                GPS Location
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="font-medium">Latitude:</span> {item.gps_latitude?.toFixed(6)}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Longitude:</span> {item.gps_longitude?.toFixed(6)}
                </p>
                {item.gps_latitude && item.gps_longitude && (
                  <a
                    href={`https://www.google.com/maps?q=${item.gps_latitude},${item.gps_longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-sm text-primary hover:underline mt-2"
                  >
                    View on Google Maps
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>QR Code & Images</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-4 gap-4">
              {item.qr_code_url && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">QR Code</p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={downloadQRCode}
                        className="text-xs"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        Download
                      </Button>
                      <Button variant="outline" size="sm" onClick={printQRCode} className="text-xs">
                        <Printer className="w-3 h-3 mr-1" />
                        Print
                      </Button>
                    </div>
                  </div>
                  <img
                    src={item.qr_code_url}
                    alt="QR Code"
                    className="w-full h-48 object-contain rounded-lg border"
                  />
                  <p className="text-xs text-center mt-2 text-muted-foreground">
                    Scan to view all item details
                  </p>
                </div>
              )}
              {item.item_photo_url && (
                <div>
                  <p className="text-sm font-medium mb-2">Item Photo</p>
                  <img
                    src={item.item_photo_url}
                    alt="Item"
                    className="w-full h-48 object-cover rounded-lg border"
                  />
                </div>
              )}
              {item.approval_letter_photo_url && (
                <div>
                  <p className="text-sm font-medium mb-2">Approval Letter</p>
                  <img
                    src={item.approval_letter_photo_url}
                    alt="Approval Letter"
                    className="w-full h-48 object-cover rounded-lg border"
                  />
                </div>
              )}
              {item.invoice_photo_url && (
                <div>
                  <p className="text-sm font-medium mb-2">Invoice</p>
                  <img
                    src={item.invoice_photo_url}
                    alt="Invoice"
                    className="w-full h-48 object-cover rounded-lg border"
                  />
                </div>
              )}
              {!item.qr_code_url &&
                !item.item_photo_url &&
                !item.approval_letter_photo_url &&
                !item.invoice_photo_url && (
                  <p className="text-sm text-muted-foreground col-span-4 text-center py-8">
                    No QR code or images uploaded for this item
                  </p>
                )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default ItemDetails;
