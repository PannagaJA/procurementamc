import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { uploadImage, generateItemCode, generateQRCode } from "@/lib/inventoryApi";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import Layout from "@/components/Layout";
import { PhotoUpload } from "@/components/PhotoUpload";
import { Combobox } from "@/components/ui/combobox";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const inventorySchema = z.object({
  item_name: z.string().min(2, "Item name must be at least 2 characters").max(200),
  specifications: z.string().max(1000).optional(),
  quantity_available: z.number().min(1, "Quantity must be at least 1"),
  cost_per_unit: z.number().min(0, "Cost must be positive"),
  vendor_name: z.string().max(200).optional(),
  vendor_contact: z.string().max(50).optional(),
  department: z.string().max(100).optional(),
});
// Departments will be fetched per-location

// Asset types
const ASSET_TYPES = [
  { id: "capital", label: "Capital" },
  { id: "recurring", label: "Recurring/Consumables" },
];

const AddInventory = () => {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Database["public"]["Tables"]["categories"]["Row"][]>(
    [],
  );
  const [locations, setLocations] = useState<Database["public"]["Tables"]["locations"]["Row"][]>(
    [],
  );
  const [itemCode, setItemCode] = useState("");
  const [gpsCoords, setGpsCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    item_name: "",
    specifications: "",
    quantity_available: 1,
    category_id: "",
    location_id: "",
    approval_letter_ref: "",
    approval_letter_date: "",
    invoice_no: "",
    invoice_date: "",
    vendor_name: "",
    vendor_address: "",
    vendor_contact: "",
    cost_per_unit: 0,
    department_id: "",
    department: "",
    department_prefix: "",
    asset_type: "",
    status: "in-use" as const,
    remarks: "",
  });

  const [files, setFiles] = useState({
    item_photo: null as File | null,
    approval_letter_photo: null as File | null,
    invoice_photo: null as File | null,
  });

  useEffect(() => {
    fetchCategories();
    fetchLocations();
    captureGPS();
  }, []);

  useEffect(() => {
    if (formData.category_id && formData.location_id) {
      updateItemCode();
    }
    // Fetch departments when location changes
    if (formData.location_id) fetchDepartmentsByLocation(formData.location_id);
  }, [formData.category_id, formData.location_id, formData.department_prefix]);

  const fetchCategories = async () => {
    const { data } = await supabase.from("categories").select("*").order("name");
    setCategories(data || []);
  };

  const fetchLocations = async () => {
    const { data } = await supabase.from("locations").select("*").order("name");
    setLocations(data || []);
  };

  const [departments, setDepartments] = useState<
    Array<{ id: string; name: string; prefix?: string | null }>
  >([]);

  const fetchDepartmentsByLocation = async (locationId: string) => {
    if (!locationId) {
      setDepartments([]);
      return;
    }
    const { data, error } = await supabase
      .from("departments")
      .select("*")
      .eq("location_id", locationId)
      .order("name");
    if (error) {
      console.error("Failed to fetch departments", error);
      setDepartments([]);
      return;
    }
    setDepartments(data || []);
  };

  const captureGPS = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setGpsCoords({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          toast({
            title: "Location captured",
            description: "GPS coordinates have been captured successfully.",
          });
        },
        (error) => {
          let errorMessage = "Unable to capture GPS coordinates.";
          let errorDescription = "You can continue without location data.";

          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = "Location access denied";
              errorDescription =
                "Please allow location access in your browser settings and try again.";
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = "Location unavailable";
              errorDescription =
                "Your location could not be determined. Please check your GPS settings.";
              break;
            case error.TIMEOUT:
              errorMessage = "Location request timeout";
              errorDescription = "Location request timed out. Please try again.";
              break;
            default:
              errorMessage = "Location error";
              errorDescription = "An unknown error occurred while getting your location.";
              break;
          }

          console.error("GPS error:", error.code, error.message);
          toast({
            variant: "destructive",
            title: errorMessage,
            description: errorDescription,
          });
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000, // 5 minutes
        },
      );
    } else {
      toast({
        variant: "destructive",
        title: "Geolocation not supported",
        description:
          "Your browser doesn't support geolocation. You can continue without location data.",
      });
    }
  };

  const updateItemCode = async () => {
    try {
      if (formData.category_id && formData.location_id) {
        const codes = await generateItemCode(
          formData.category_id,
          formData.location_id,
          formData.quantity_available,
          formData.department_prefix || undefined,
        );
        if (codes.length === 1) {
          setItemCode(codes[0]);
        } else {
          setItemCode(`${codes[0]} to ${codes[codes.length - 1]}`);
        }
      } else {
        const baseCode = `ITEM-${Date.now().toString().slice(-6)}`;
        if (formData.quantity_available === 1) {
          setItemCode(`${baseCode}-1`);
        } else {
          setItemCode(`${baseCode}-1 to ${baseCode}-${formData.quantity_available}`);
        }
      }
    } catch (error) {
      console.error("Error generating item code:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate form data
      const validation = inventorySchema.safeParse({
        item_name: formData.item_name,
        specifications: formData.specifications || undefined,
        quantity_available: formData.quantity_available,
        cost_per_unit: formData.cost_per_unit,
        vendor_name: formData.vendor_name || undefined,
        vendor_contact: formData.vendor_contact || undefined,
        department: formData.department || undefined,
      });

      if (!validation.success) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: validation.error.errors[0].message,
        });
        setLoading(false);
        return;
      }

      // Item code is generated only if both category and location are selected
      // If not selected, we'll use a generic code or leave it empty
      let finalItemCode = itemCode;
      if (!formData.category_id || !formData.location_id) {
        // Generate a simple fallback code
        const timestamp = Date.now().toString().slice(-6);
        finalItemCode = `ITEM-${timestamp}`;
      }

      // Upload images
      const [itemPhotoUrl, approvalPhotoUrl, invoicePhotoUrl] = await Promise.all([
        files.item_photo ? uploadImage(files.item_photo) : null,
        files.approval_letter_photo ? uploadImage(files.approval_letter_photo) : null,
        files.invoice_photo ? uploadImage(files.invoice_photo) : null,
      ]);

      // Get current user
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // For quantity > 1, we need to create multiple items with unique codes
      const itemsToInsert = [];
      let generatedCodes: string[] = [];

      if (formData.category_id && formData.location_id) {
        generatedCodes = await generateItemCode(
          formData.category_id,
          formData.location_id,
          formData.quantity_available,
          formData.department_prefix || undefined,
        );
      } else {
        // Generate fallback codes
        const timestamp = Date.now().toString().slice(-6);
        generatedCodes = Array.from(
          { length: formData.quantity_available },
          (_, i) => `ITEM-${timestamp}-${String(i + 1).padStart(3, "0")}`,
        );
      }

      for (let i = 0; i < formData.quantity_available; i++) {
        itemsToInsert.push({
          item_code: generatedCodes[i],
          category_id: formData.category_id || null,
          location_id: formData.location_id || null,
          item_name: formData.item_name,
          specifications: formData.specifications || null,
          quantity_available: 1, // Each item has quantity 1
          cost_per_unit: formData.cost_per_unit,
          vendor_name: formData.vendor_name || null,
          vendor_contact: formData.vendor_contact || null,
          department: formData.department || null,
          asset_type: formData.asset_type || null,
          item_photo_url: itemPhotoUrl,
          approval_letter_photo_url: approvalPhotoUrl,
          invoice_photo_url: invoicePhotoUrl,
          approval_letter_ref: formData.approval_letter_ref || null,
          approval_letter_date: formData.approval_letter_date || null,
          invoice_no: formData.invoice_no || null,
          invoice_date: formData.invoice_date || null,
          gps_latitude: gpsCoords?.latitude || null,
          gps_longitude: gpsCoords?.longitude || null,
          created_by: user?.id,
        });
      }

      // Insert all inventory items
      const { data: insertedItems, error } = await supabase
        .from("inventory")
        .insert(itemsToInsert)
        .select();

      if (error) throw error;

      // Generate QR codes for each item
      for (const item of insertedItems || []) {
        const qrCodeUrl = await generateQRCode(item.item_code || "", item.id);
        if (qrCodeUrl) {
          await supabase.from("inventory").update({ qr_code_url: qrCodeUrl }).eq("id", item.id);
        }
      }

      toast({
        title: "Success!",
        description: `${formData.quantity_available} item${formData.quantity_available > 1 ? "s" : ""} have been added to inventory.`,
      });

      // Navigate to inventory list since multiple items were created
      navigate({ to: "/inventory" });
    } catch (error) {
      console.error("Error adding inventory:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add inventory item.",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (key: keyof typeof files, file: File | null) => {
    setFiles((prev) => ({ ...prev, [key]: file }));
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto animate-in fade-in-0 duration-700">
        <div className="mb-8 text-center">
          <h2 className="text-4xl font-bold tracking-tight text-foreground mb-2">Add New Item</h2>
          <p className="text-muted-foreground text-lg">Add a new item to the inventory system</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <Card className="bg-card/90 backdrop-blur-sm shadow-xl border-0 rounded-xl transition-all duration-300 hover:shadow-2xl">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-t-xl">
              <CardTitle className="text-2xl font-bold text-card-foreground">
                Basic Information
              </CardTitle>
              <CardDescription className="text-base">
                {itemCode && (
                  <span className="inline-flex items-center gap-2 px-4 py-2 mt-3 bg-blue-100 text-blue-800 rounded-lg font-mono text-base font-semibold animate-in slide-in-from-top duration-500">
                    Item Code: {itemCode}
                  </span>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 p-8">
              <div className="grid md:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="category" className="text-base font-semibold text-foreground">
                    Category
                  </Label>
                  <Combobox
                    options={categories.map((cat) => ({
                      value: cat.id,
                      label: `${cat.name} (${cat.prefix})`,
                    }))}
                    value={formData.category_id}
                    onValueChange={(value) => {
                      setFormData((prev) => ({ ...prev, category_id: value }));
                      updateItemCode();
                    }}
                    placeholder="Select category..."
                    searchPlaceholder="Search categories..."
                    emptyText="No categories found."
                  />
                </div>

                <div className="space-y-3">
                  <Label htmlFor="location" className="text-base font-semibold text-foreground">
                    Location
                  </Label>
                  <Select
                    value={formData.location_id}
                    onValueChange={(value) => {
                      setFormData((prev) => ({ ...prev, location_id: value }));
                      updateItemCode();
                    }}
                  >
                    <SelectTrigger className="h-12 text-base">
                      <SelectValue placeholder="Select location" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((loc) => {
                        const lname = (loc.name || "").toLowerCase();
                        let code = loc.prefix || "";
                        if (lname.includes("engineering")) code = "EC";
                        else if (lname.includes("degree")) code = "DC";
                        else if (lname.includes("admin")) code = "AB";

                        let display = loc.name;
                        if (lname.includes("engineering"))
                          display = `Engineering college - ${code}`;
                        else if (lname.includes("degree")) display = `Degree college - ${code}`;
                        else if (lname.includes("admin")) display = `Admin block - ${code}`;
                        else if (code) display = `${loc.name} (${code})`;

                        return (
                          <SelectItem key={loc.id} value={loc.id}>
                            {display}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label htmlFor="department" className="text-base font-semibold text-foreground">
                    Department
                  </Label>
                  <Select
                    value={formData.department_id}
                    onValueChange={(value) => {
                      if (value === "none") {
                        setFormData((prev) => ({
                          ...prev,
                          department_id: "",
                          department: "",
                          department_prefix: "",
                        }));
                        updateItemCode();
                        return;
                      }
                      const dept = departments.find((d) => d.id === value);
                      setFormData((prev) => ({
                        ...prev,
                        department_id: value,
                        department: dept ? dept.name : value,
                        department_prefix: dept ? dept.prefix || "" : "",
                      }));
                      updateItemCode();
                    }}
                  >
                    <SelectTrigger className="h-12 text-base">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {departments.map((d) => (
                        <SelectItem
                          key={d.id}
                          value={d.id}
                        >{`${d.name}${d.prefix ? ` (${d.prefix})` : ""}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label htmlFor="asset_type" className="text-base font-semibold text-foreground">
                    Asset Type
                  </Label>
                  <Select
                    value={formData.asset_type}
                    onValueChange={(value) =>
                      setFormData((prev) => ({ ...prev, asset_type: value }))
                    }
                  >
                    <SelectTrigger className="h-12 text-base">
                      <SelectValue placeholder="Select asset type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {ASSET_TYPES.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-3">
                <Label htmlFor="item_name" className="text-base font-semibold text-foreground">
                  Item Name *
                </Label>
                <Input
                  id="item_name"
                  value={formData.item_name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, item_name: e.target.value }))}
                  required
                  className="h-12 text-base"
                />
              </div>

              <div className="space-y-3">
                <Label htmlFor="specifications" className="text-base font-semibold text-foreground">
                  Specifications
                </Label>
                <Textarea
                  id="specifications"
                  value={formData.specifications}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, specifications: e.target.value }))
                  }
                  rows={4}
                  className="text-base resize-none"
                />
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="quantity" className="text-base font-semibold text-foreground">
                    Quantity *
                  </Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    value={formData.quantity_available}
                    onChange={(e) => {
                      const newQuantity = parseInt(e.target.value);
                      setFormData((prev) => ({
                        ...prev,
                        quantity_available: newQuantity,
                      }));
                      // Update item code preview when quantity changes
                      if (newQuantity > 0) {
                        updateItemCode();
                      }
                    }}
                    required
                    className="h-12 text-base"
                  />
                </div>

                <div className="space-y-3">
                  <Label htmlFor="cost" className="text-base font-semibold text-foreground">
                    Cost per Unit (₹) *
                  </Label>
                  <Input
                    id="cost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.cost_per_unit}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        cost_per_unit: parseFloat(e.target.value),
                      }))
                    }
                    required
                    className="h-12 text-base"
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-base font-semibold text-foreground">Total Cost</Label>
                  <div className="flex h-12 w-full rounded-lg border-2 border-border bg-muted px-4 py-3 text-base font-semibold text-foreground">
                    ₹{(formData.quantity_available * formData.cost_per_unit).toFixed(2)}
                  </div>
                </div>
              </div>

              <PhotoUpload
                value={files.item_photo}
                onChange={(file) => handleFileChange("item_photo", file)}
                label="Item Photo"
              />
            </CardContent>
          </Card>

          <Card className="bg-card/90 backdrop-blur-sm shadow-xl border-0 rounded-xl transition-all duration-300 hover:shadow-2xl">
            <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-t-xl">
              <CardTitle className="text-2xl font-bold text-card-foreground">
                Vendor & Invoice Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 p-8">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="vendor_name" className="text-base font-semibold text-foreground">
                    Vendor Name
                  </Label>
                  <Input
                    id="vendor_name"
                    value={formData.vendor_name}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, vendor_name: e.target.value }))
                    }
                    className="h-12 text-base"
                  />
                </div>

                <div className="space-y-3">
                  <Label
                    htmlFor="vendor_contact"
                    className="text-base font-semibold text-foreground"
                  >
                    Vendor Contact
                  </Label>
                  <Input
                    id="vendor_contact"
                    value={formData.vendor_contact}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, vendor_contact: e.target.value }))
                    }
                    className="h-12 text-base"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <Label htmlFor="vendor_address" className="text-base font-semibold text-foreground">
                  Vendor Address
                </Label>
                <Textarea
                  id="vendor_address"
                  value={formData.vendor_address}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, vendor_address: e.target.value }))
                  }
                  rows={3}
                  className="text-base resize-none"
                />
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="invoice_no" className="text-base font-semibold text-foreground">
                    Invoice Number
                  </Label>
                  <Input
                    id="invoice_no"
                    value={formData.invoice_no}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, invoice_no: e.target.value }))
                    }
                    className="h-12 text-base"
                  />
                </div>

                <div className="space-y-3">
                  <Label htmlFor="invoice_date" className="text-base font-semibold text-foreground">
                    Invoice Date
                  </Label>
                  <Input
                    id="invoice_date"
                    type="date"
                    value={formData.invoice_date}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, invoice_date: e.target.value }))
                    }
                    className="h-12 text-base"
                  />
                </div>
              </div>

              <PhotoUpload
                value={files.invoice_photo}
                onChange={(file) => handleFileChange("invoice_photo", file)}
                label="Invoice Photo"
              />

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="approval_ref" className="text-base font-semibold text-foreground">
                    Approval Letter Ref
                  </Label>
                  <Input
                    id="approval_ref"
                    value={formData.approval_letter_ref}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, approval_letter_ref: e.target.value }))
                    }
                    className="h-12 text-base"
                  />
                </div>

                <div className="space-y-3">
                  <Label
                    htmlFor="approval_date"
                    className="text-base font-semibold text-foreground"
                  >
                    Approval Date
                  </Label>
                  <Input
                    id="approval_date"
                    type="date"
                    value={formData.approval_letter_date}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, approval_letter_date: e.target.value }))
                    }
                    className="h-12 text-base"
                  />
                </div>
              </div>

              <PhotoUpload
                value={files.approval_letter_photo}
                onChange={(file) => handleFileChange("approval_letter_photo", file)}
                label="Approval Letter Photo"
              />
            </CardContent>
          </Card>

          <Card className="bg-card/90 backdrop-blur-sm shadow-xl border-0 rounded-xl transition-all duration-300 hover:shadow-2xl">
            <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 rounded-t-xl">
              <CardTitle className="text-2xl font-bold text-card-foreground">
                Location & Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 p-8">
              <div />

              <div className="space-y-3">
                <Label htmlFor="status" className="text-base font-semibold text-gray-700">
                  Status
                </Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: string) =>
                    setFormData((prev) => ({ ...prev, status: value as "in-use" }))
                  }
                >
                  <SelectTrigger className="h-12 text-base">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in-use">In Use</SelectItem>
                    <SelectItem value="discarded">Discarded</SelectItem>
                    <SelectItem value="scrapped">Scrapped</SelectItem>
                    <SelectItem value="transferred">Transferred</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {gpsCoords && (
                <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-lg flex items-start gap-3 animate-in slide-in-from-left duration-500">
                  <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    📍
                  </div>
                  <div className="text-base">
                    <p className="font-semibold text-blue-800">GPS Coordinates Captured</p>
                    <p className="text-blue-600">
                      Lat: {gpsCoords.latitude.toFixed(6)}, Long: {gpsCoords.longitude.toFixed(6)}
                    </p>
                  </div>
                </div>
              )}

              {!gpsCoords && (
                <div className="flex items-center gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={captureGPS}
                    className="flex items-center gap-2"
                  >
                    📍 Get Location
                  </Button>
                  <p className="text-sm text-muted-foreground">
                    Click to capture GPS coordinates for this item
                  </p>
                </div>
              )}

              <div className="space-y-3">
                <Label htmlFor="remarks" className="text-base font-semibold text-gray-700">
                  Remarks
                </Label>
                <Textarea
                  id="remarks"
                  value={formData.remarks}
                  onChange={(e) => setFormData((prev) => ({ ...prev, remarks: e.target.value }))}
                  rows={4}
                  className="text-base resize-none"
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-6 pt-4">
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 py-4 text-lg font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 hover:scale-105 hover:shadow-xl rounded-xl"
            >
              {loading ? "Adding..." : "Add to Inventory"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate({ to: "/inventory" })}
              disabled={loading}
              className="flex-1 py-4 text-lg font-semibold border-2 border-border hover:bg-accent transition-all duration-300 hover:scale-105 hover:shadow-lg rounded-xl"
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </Layout>
  );
};

export default AddInventory;
