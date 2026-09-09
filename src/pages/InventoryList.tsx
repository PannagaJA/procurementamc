import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '@/lib/inventoryApi';
import Layout from "@/components/Layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from '@tanstack/react-router';
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Download } from "lucide-react";
import QRScanner from "@/components/QRScanner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScanLine } from "lucide-react";
import { usePagination } from "@/hooks/use-pagination";
import { PaginationControls } from "@/components/PaginationControls";
import { createPaginatedQuery, createCountQuery } from "@/lib/utils";

interface InventoryItem {
  id: string;
  sl_no: number;
  item_code: string;
  item_name: string;
  quantity_available: number;
  total_cost: number;
  status: string;
  categories: { name: string } | null;
  locations: { name: string; prefix?: string } | null;
  department: string | null;
  asset_type?: string | null;
}

const InventoryList = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [userRole, setUserRole] = useState<string | null>(null);
  const [showQRScanner, setShowQRScanner] = useState(false);

  const {
    pagination,
    setPage,
    setPageSize,
    setTotal,
    resetPagination,
  } = usePagination(10, 1);

  // Reset to first page whenever filters/search change
  useEffect(() => {
    setPage(1);
  }, [searchTerm, statusFilter, categoryFilter, locationFilter, departmentFilter]);

  // Queries
  const { data: inventoryData, isLoading } = useQuery({
    queryKey: ['inventory', pagination.page, pagination.pageSize, searchTerm, statusFilter, categoryFilter, locationFilter, departmentFilter],
    queryFn: () => inventoryApi.getInventoryItems({
      limit: pagination.pageSize,
      offset: (pagination.page - 1) * pagination.pageSize,
      search: searchTerm,
      status: statusFilter,
      categoryId: categoryFilter,
      locationId: locationFilter,
      departmentId: departmentFilter,
    }),
    placeholderData: (previousData: any) => previousData,
  });

  useEffect(() => {
    if (inventoryData?.count != null) setTotal(inventoryData.count);
  }, [inventoryData]);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: inventoryApi.getCategories,
  });

  const { data: locations = [] } = useQuery({
    queryKey: ['locations'],
    queryFn: inventoryApi.getLocations,
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('*').order('name');
      return data || [];
    },
  });

  const items = (inventoryData?.data || []) as any[];

  useEffect(() => {
    checkUserRole();
  }, []);

  const checkUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();
        setUserRole(roleData?.role || null);
      }
    } catch (error) {
      console.error("Error checking user role:", error);
    }
  };

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      inventoryApi.updateInventoryItem(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast({
        title: "Status updated",
        description: "Item status has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: error.message || "Failed to update item status.",
      });
    },
  });

  const updateItemStatus = (itemId: string, newStatus: string, itemCode: string) => {
    updateStatusMutation.mutate({ id: itemId, status: newStatus });
  };

  const deleteMutation = useMutation({
    mutationFn: inventoryApi.deleteInventoryItem,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      toast({
        title: "Item deleted",
        description: "Item has been successfully deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: error.message || "Failed to delete the item.",
      });
    },
  });

  const deleteItem = (itemId: string, itemCode: string) => {
    deleteMutation.mutate(itemId);
  };

  const clearFilters = () => {
    setSearchTerm("");
    setSearchInput("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setLocationFilter("all");
    setDepartmentFilter("all");
    resetPagination();
  };

  const exportToPDF = async () => {
    const doc = new jsPDF();
    
    // Load logo
    let logoData = null;
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = '/amc.jpeg';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      
      // Create canvas to get data URL
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      logoData = canvas.toDataURL('image/jpeg');
    } catch (error) {
      console.warn('Failed to load logo:', error);
    }
    
    // Add logo if available
    if (logoData) {
      doc.addImage(logoData, 'JPEG', 15, 10, 30, 30);
    }
    
    // Add title
    doc.setFontSize(20);
    doc.text('AMC Inventory Report', 105, 25, { align: 'center' });
    
    // Add date
    doc.setFontSize(12);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 105, 35, { align: 'center' });
    
    // Prepare table data
    const tableData = items.map((item) => [
      item.item_code,
      item.item_name,
      item.categories?.name || '-',
      item.quantity_available,
      `₹${parseFloat(String(item.total_cost || 0)).toLocaleString('en-IN')}`
    ]);
    
    // Calculate totals
    const totalItems = items.length;
    const totalValue = items.reduce((sum, item) => sum + (item.total_cost || 0), 0);
    
    // Add table
    autoTable(doc, {
      head: [['Item Code', 'Item Name', 'Category', 'Quantity', 'Total Cost']],
      body: tableData,
      startY: 50,
      styles: {
        fontSize: 10,
        cellPadding: 4,
      },
      headStyles: {
        fillColor: [59, 130, 246], // blue
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      columnStyles: {
        0: { cellWidth: 30 }, // Item Code
        1: { cellWidth: 50 }, // Item Name
        2: { cellWidth: 30 }, // Category
        3: { cellWidth: 20 }, // Quantity
        4: { cellWidth: 30 }, // Total Cost
      },
    });
    
    // Add summary
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.text(`Total Items: ${totalItems}`, 15, finalY);
    doc.text(`Total Value: ₹${totalValue.toLocaleString('en-IN')}`, 15, finalY + 10);
    
    // Save the PDF
    doc.save('inventory-report.pdf');
  };

  const handleQRScan = (result: string) => {
    setShowQRScanner(false);

    // Handle both direct item codes and URLs containing item codes
    let itemCode = result;

    // If it's a URL, extract the item code from the path
    if (result.includes('/inventory/')) {
      const urlParts = result.split('/inventory/');
      if (urlParts.length > 1) {
        itemCode = urlParts[1].split('/')[0]; // Get the ID part
        // If it's an ID, we need to find the item by ID instead
        const foundItem = items.find(item => item.id === itemCode);
        if (foundItem) {
          navigate({ to: `/inventory/${foundItem.id}` });
          toast({
            title: "Item found",
            description: `Found item: ${foundItem.item_name} (${foundItem.item_code})`,
          });
          return;
        }
      }
    }

    // Search for the item with the scanned QR code (item_code)
    const foundItem = items.find(item => item.item_code === itemCode);
    if (foundItem) {
      navigate({ to: `/inventory/${foundItem.id}` });
      toast({
        title: "Item found",
        description: `Found item: ${foundItem.item_name} (${foundItem.item_code})`,
      });
    } else {
      toast({
        variant: "destructive",
        title: "Item not found",
        description: `No item found with code: ${itemCode}`,
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      "in-use": "default",
      "discarded": "secondary",
      "scrapped": "destructive",
      "transferred": "outline",
    };

    return (
      <Badge variant={variants[status] || "default"}>
        {status.replace("-", " ").toUpperCase()}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Inventory</h2>
              <p className="text-muted-foreground">View and search all inventory items</p>
            </div>
          </div>
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-64" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-8 animate-in fade-in-0 duration-700">
        

        <Card className="bg-card/90 backdrop-blur-sm shadow-xl border-0 rounded-xl transition-all duration-300 hover:shadow-2xl">
          <CardHeader className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20 rounded-t-xl">
            <CardTitle className="text-2xl font-bold text-card-foreground flex items-center gap-2">
              <ScanLine className="w-6 h-6 text-green-600 dark:text-green-400" />
              Scan to Get Info
            </CardTitle>
            <p className="text-sm text-muted-foreground">Scan QR codes to quickly access item details</p>
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

        <Card className="bg-card/90 backdrop-blur-sm shadow-xl border-0 rounded-xl transition-all duration-300 hover:shadow-2xl">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-t-xl">
            <CardTitle className="text-2xl font-bold text-card-foreground">Search & Filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-8">
            <div className="flex items-center gap-3">
              <Input
                placeholder="Search by item code, name, department, category, or location..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') setSearchTerm(searchInput); }}
                className="pl-3 py-2 text-sm rounded-lg h-10 w-64"
              />
              <Button onClick={() => setSearchTerm(searchInput)} className="h-10">Search</Button>
            </div>

            <div className="grid md:grid-cols-5 gap-6">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-12 text-base">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="in-use">In Use</SelectItem>
                  <SelectItem value="discarded">Discarded</SelectItem>
                  <SelectItem value="scrapped">Scrapped</SelectItem>
                  <SelectItem value="transferred">Transferred</SelectItem>
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-12 text-base">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="h-12 text-base">
                  <SelectValue placeholder="Location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}{loc.prefix ? ` (${loc.prefix})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                <SelectTrigger className="h-12 text-base">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map((d: any) => (
                    <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button 
                variant="outline" 
                onClick={clearFilters}
                className="h-12 text-base font-medium border-2 border-border hover:bg-accent transition-all duration-300 hover:scale-105 hover:shadow-md rounded-lg"
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/90 backdrop-blur-sm shadow-xl border-0 rounded-xl transition-all duration-300 hover:shadow-2xl">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="w-max">
                <TableHeader className="bg-muted">
                  <TableRow>
                    <TableHead className="text-base font-semibold text-muted-foreground">#</TableHead>
                    <TableHead className="text-base font-semibold text-muted-foreground">Item Code</TableHead>
                    <TableHead className="text-base font-semibold text-muted-foreground">Item Name</TableHead>
                    <TableHead className="text-base font-semibold text-muted-foreground">Category</TableHead>
                    <TableHead className="text-base font-semibold text-muted-foreground">Location</TableHead>
                    <TableHead className="text-base font-semibold text-muted-foreground">Asset Type</TableHead>
                    <TableHead className="text-base font-semibold text-muted-foreground">Department</TableHead>
                    <TableHead className="text-base font-semibold text-muted-foreground text-right">Quantity</TableHead>
                    <TableHead className="text-base font-semibold text-muted-foreground text-right">Total Cost</TableHead>
                    <TableHead className="text-base font-semibold text-muted-foreground">Status</TableHead>
                    <TableHead className="text-base font-semibold text-muted-foreground text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-12 text-muted-foreground text-lg">
                        No items found. Try adjusting your search or filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item, index) => (
                      <TableRow 
                        key={item.id} 
                        className="hover:bg-muted/50 animate-in slide-in-from-bottom-2 duration-500"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        <TableCell className="text-base">{index + 1}</TableCell>
                        <TableCell className="font-mono text-base text-foreground whitespace-nowrap">{item.item_code}</TableCell>
                        <TableCell className="font-semibold text-base text-foreground whitespace-nowrap">{item.item_name}</TableCell>
                        <TableCell className="text-base whitespace-nowrap">{item.categories?.name || "-"}</TableCell>
                        <TableCell className="text-base whitespace-nowrap">{item.locations ? `${item.locations.name}${item.locations.prefix ? ` (${item.locations.prefix})` : ''}` : "-"}</TableCell>
                          <TableCell className="text-base whitespace-nowrap">{item.asset_type === 'capital' ? 'Capital' : item.asset_type === 'recurring' ? 'Recurring/Consumables' : '-'}</TableCell>
                          <TableCell className="text-base whitespace-nowrap">{item.department || "-"}</TableCell>
                        <TableCell className="text-right text-base font-medium">{item.quantity_available}</TableCell>
                        <TableCell className="text-right text-base font-semibold text-foreground">
                          ₹{parseFloat(String(item.total_cost || 0)).toLocaleString("en-IN")}
                        </TableCell>
                        <TableCell>{getStatusBadge(item.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate({ to: `/inventory/${item.id}` })}
                              className="text-primary hover:text-primary hover:bg-primary/10 transition-all duration-300 hover:scale-105 rounded-lg px-3 py-2"
                            >
                              View
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate({ to: `/inventory/${item.id}/history` })}
                              className="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-950/20 transition-all duration-300 hover:scale-105 rounded-lg px-3 py-2"
                            >
                              History
                            </Button>
                            <Select
                              value={item.status || "in-use"}
                              onValueChange={(value) => updateItemStatus(item.id, value, item.item_code)}
                            >
                              <SelectTrigger className="w-32 h-10 text-base">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="in-use">In Use</SelectItem>
                                <SelectItem value="discarded">Discarded</SelectItem>
                                <SelectItem value="scrapped">Scrapped</SelectItem>
                                <SelectItem value="transferred">Transferred</SelectItem>
                              </SelectContent>
                            </Select>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10 transition-all duration-300 hover:scale-105 rounded-lg px-3 py-2"
                                >
                                  Delete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="bg-background rounded-xl shadow-2xl">
                                <AlertDialogHeader>
                                  <AlertDialogTitle className="text-xl font-bold">Delete Item</AlertDialogTitle>
                                  <AlertDialogDescription className="text-base">
                                    Are you sure you want to delete item "{item.item_name}" with code "{item.item_code}"?
                                    This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel className="rounded-lg">Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteItem(item.id, item.item_code)}
                                    className="bg-destructive hover:bg-destructive/90 rounded-lg px-4 py-2"
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <PaginationControls
              currentPage={pagination.page}
                totalPages={Math.ceil(pagination.total / pagination.pageSize)}
                currentItemsCount={items.length}
              pageSize={pagination.pageSize}
              totalItems={pagination.total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={showQRScanner} onOpenChange={setShowQRScanner}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scan QR Code</DialogTitle>
          </DialogHeader>
          <QRScanner
            onScan={handleQRScan}
            onClose={() => setShowQRScanner(false)}
          />
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default InventoryList;
