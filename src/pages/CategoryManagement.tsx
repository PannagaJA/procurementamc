import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, Settings, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePagination } from "@/hooks/use-pagination";
import { PaginationControls } from "@/components/PaginationControls";
import { createPaginatedQuery } from "@/lib/utils";

interface Category {
  id: number;
  name: string;
  prefix?: string;
  created_at: string;
}

const CategoryManagement = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryPrefix, setNewCategoryPrefix] = useState("");
  const [addingCategory, setAddingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrefix, setEditPrefix] = useState("");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const { toast } = useToast();

  const {
    pagination,
    setPage,
    setPageSize,
    setTotal,
  } = usePagination(10, 1);

  useEffect(() => {
    fetchCategories();
  }, [pagination.page, pagination.pageSize]);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const { data, error, count } = await supabase
        .from("categories")
        .select("*", { count: 'exact' })
        .order("name")
        .range((pagination.page - 1) * pagination.pageSize, pagination.page * pagination.pageSize - 1);

      if (error) throw error;
      setCategories(data || []);
      setTotal(count || 0);
    } catch (error) {
      console.error("Error fetching categories:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load categories.",
      });
    } finally {
      setLoading(false);
    }
  };

  const addCategory = async () => {
    if (!newCategoryName.trim()) {
      toast({
        variant: "destructive",
        title: "Invalid input",
        description: "Category name cannot be empty.",
      });
      return;
    }

    if (newCategoryPrefix.length !== 3) {
      toast({
        variant: "destructive",
        title: "Invalid input",
        description: "Prefix must be exactly 3 characters.",
      });
      return;
    }

    setAddingCategory(true);
    try {
      const prefix = (newCategoryPrefix || '').trim().toUpperCase();

      const { data, error } = await supabase
        .from("categories")
        .insert([{ name: newCategoryName.trim(), prefix }])
        .select()
        .single();

      if (error) throw error;

      setCategories(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewCategoryName("");
      setNewCategoryPrefix("");
      toast({
        title: "Category added",
        description: `"${data.name}" has been added successfully.`,
      });
    } catch (error: any) {
      console.error("Error adding category:", error);
      // Friendly handling for unique constraint (duplicate prefix/name)
      let description = error.message || "Failed to add category.";
      if (error?.code === '23505' || (typeof description === 'string' && description.toLowerCase().includes('duplicate key'))) {
        description = 'A category with the same name or prefix already exists.';
      }

      toast({
        variant: "destructive",
        title: "Addition failed",
        description,
      });
    } finally {
      setAddingCategory(false);
    }
  };

  const deleteCategory = async (categoryId: number, categoryName: string) => {
    try {
      // Check if category is being used by any inventory items
      const { data: items, error: checkError } = await supabase
        .from("inventory")
        .select("id")
        .eq("category_id", categoryId)
        .limit(1);

      if (checkError) throw checkError;

      if (items && items.length > 0) {
        toast({
          variant: "destructive",
          title: "Cannot delete",
          description: `Category "${categoryName}" is being used by inventory items.`,
        });
        return;
      }

      const { error } = await supabase
        .from("categories")
        .delete()
        .eq("id", categoryId);

      if (error) throw error;

      setCategories(prev => prev.filter(cat => cat.id !== categoryId));
      toast({
        title: "Category deleted",
        description: `"${categoryName}" has been deleted successfully.`,
      });
    } catch (error: any) {
      console.error("Error deleting category:", error);
      toast({
        variant: "destructive",
        title: "Deletion failed",
        description: error.message || "Failed to delete category.",
      });
    }
  };

  const editCategory = async () => {
    if (!editingCategory || !editName.trim()) {
      toast({
        variant: "destructive",
        title: "Invalid input",
        description: "Category name cannot be empty.",
      });
      return;
    }

    if (editPrefix.length !== 3) {
      toast({
        variant: "destructive",
        title: "Invalid input",
        description: "Prefix must be exactly 3 characters.",
      });
      return;
    }

    try {
      const prefix = (editPrefix || '').trim().toUpperCase();

      const { data, error } = await supabase
        .from("categories")
        .update({ name: editName.trim(), prefix })
        .eq("id", editingCategory.id)
        .select()
        .single();

      if (error) throw error;

      setCategories(prev => prev.map(cat => cat.id === editingCategory.id ? data : cat).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingCategory(null);
      setEditName("");
      setEditPrefix("");
      toast({
        title: "Category updated",
        description: `"${data.name}" has been updated successfully.`,
      });
    } catch (error: any) {
      console.error("Error updating category:", error);
      let description = error.message || "Failed to update category.";
      if (error?.code === '23505' || (typeof description === 'string' && description.toLowerCase().includes('duplicate key'))) {
        description = 'A category with the same name or prefix already exists.';
      }

      toast({
        variant: "destructive",
        title: "Update failed",
        description,
      });
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">Category Management</h2>
              <p className="text-muted-foreground">Manage inventory categories</p>
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Category Management</h2>
            <p className="text-muted-foreground">Manage inventory categories</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Add New Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                <Label htmlFor="category-name">Category Name</Label>
                <Input
                  id="category-name"
                  placeholder="Enter category name"
                  value={newCategoryName}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewCategoryName(val);
                    // live-generate prefix: first 3 chars of name without spaces
                    const prefix = val.replace(/\s+/g, '').slice(0, 3).toUpperCase();
                    setNewCategoryPrefix(prefix);
                  }}
                  onKeyPress={(e) => e.key === "Enter" && setShowConfirmDialog(true)}
                />
              </div>

              <div className="w-48">
                <Label htmlFor="category-prefix">Prefix</Label>
                <Input
                  id="category-prefix"
                  placeholder="Prefix (3 chars)"
                  value={newCategoryPrefix}
                  onChange={(e) => setNewCategoryPrefix(e.target.value.toUpperCase().slice(0, 3))}
                  maxLength={3}
                  className="h-10"
                />
              </div>

              <div className="flex items-end">
                <Button 
                  disabled={addingCategory || !newCategoryName.trim()}
                  onClick={() => {
                    if (newCategoryPrefix.length !== 3) {
                      setShowWarningDialog(true);
                    } else {
                      setShowConfirmDialog(true);
                    }
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {addingCategory ? "Adding..." : "Add Category"}
                </Button>

                <AlertDialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Invalid Prefix</AlertDialogTitle>
                      <AlertDialogDescription>
                        Prefix must be exactly 3 characters (letters). Please correct the prefix before adding the category.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>OK</AlertDialogCancel>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Confirm Add Category</AlertDialogTitle>
                      <AlertDialogDescription>
                        You're about to add the category <strong>{newCategoryName}</strong> with prefix <strong>{newCategoryPrefix}</strong>.
                        Proceed?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={addCategory} className="bg-primary text-primary-foreground">
                        Confirm
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Existing Categories ({pagination.total})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category Name</TableHead>
                    <TableHead>Prefix</TableHead>
                    <TableHead>Created Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                        No categories found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    categories.map((category) => (
                      <TableRow key={category.id}>
                            <TableCell className="font-medium">
                              {category.name}
                            </TableCell>
                            <TableCell className="font-medium">
                              {category.prefix || '-'}
                            </TableCell>
                            <TableCell>
                              {new Date(category.created_at).toLocaleDateString()}
                            </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingCategory(category);
                                setEditName(category.name);
                                setEditPrefix(category.prefix || "");
                              }}
                            >
                              <Edit className="h-4 w-4 mr-2" />
                              Edit
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Category</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{category.name}"? This action cannot be undone.
                                    The category must not be used by any inventory items.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteCategory(category.id, category.name)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
              pageSize={pagination.pageSize}
              totalItems={pagination.total}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!editingCategory} onOpenChange={(open) => !open && setEditingCategory(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Category</DialogTitle>
            <DialogDescription>
              Update the category name and prefix.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-category-name">Category Name</Label>
              <Input
                id="edit-category-name"
                placeholder="Enter category name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="edit-category-prefix">Prefix</Label>
              <Input
                id="edit-category-prefix"
                placeholder="Prefix (3 chars)"
                value={editPrefix}
                onChange={(e) => setEditPrefix(e.target.value.toUpperCase().slice(0, 3))}
                maxLength={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCategory(null)}>
              Cancel
            </Button>
            <Button onClick={editCategory}>
              Update Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default CategoryManagement;