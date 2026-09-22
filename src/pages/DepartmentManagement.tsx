import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function DepartmentManagement() {
  const [locations, setLocations] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [form, setForm] = useState({ location_id: "", name: "", prefix: "" });
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", prefix: "" });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchLocations();
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    try {
      setCheckingAdmin(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setIsAdmin(false);
        setCheckingAdmin(false);
        return;
      }
      const { data: roleData, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      setIsAdmin(roleData?.role === "admin");
    } catch (err) {
      console.error("Failed to check admin role", err);
      setIsAdmin(false);
    } finally {
      setCheckingAdmin(false);
    }
  };

  useEffect(() => {
    if (form.location_id) fetchDepartments(form.location_id);
  }, [form.location_id]);

  const fetchLocations = async () => {
    const { data, error } = await supabase.from("locations").select("*").order("name");
    if (error) return console.error(error);
    setLocations(data || []);
  };

  const fetchDepartments = async (locationId: string) => {
    const { data, error } = await supabase
      .from("departments")
      .select("*")
      .eq("location_id", locationId)
      .order("name");
    if (error) return console.error(error);
    setDepartments(data || []);
  };

  const handleCreate = async () => {
    if (!isAdmin) {
      toast({
        title: "Unauthorized",
        description: "Only admins can create departments",
        variant: "destructive",
      });
      return;
    }
    if (!form.location_id || !form.name) {
      toast({
        title: "Validation",
        description: "Select a location and enter a department name",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("departments")
      .insert({
        name: form.name.trim(),
        prefix: form.prefix.trim() || null,
        location_id: form.location_id,
      })
      .select()
      .single();
    setLoading(false);
    if (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to create department", variant: "destructive" });
      return;
    }
    toast({ title: "Created", description: `${data.name} created` });
    setForm({ ...form, name: "", prefix: "" });
    fetchDepartments(form.location_id);
  };

  const startEdit = (d: any) => {
    setEditingId(d.id);
    setEditForm({ name: d.name || "", prefix: d.prefix || "" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ name: "", prefix: "" });
  };

  const handleUpdate = async (id: string) => {
    if (!isAdmin) {
      toast({
        title: "Unauthorized",
        description: "Only admins can edit departments",
        variant: "destructive",
      });
      return;
    }
    if (!editForm.name.trim()) {
      toast({
        title: "Validation",
        description: "Department name cannot be empty",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("departments")
      .update({ name: editForm.name.trim(), prefix: editForm.prefix.trim() || null })
      .eq("id", id)
      .select()
      .single();
    setLoading(false);
    if (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to update department", variant: "destructive" });
      return;
    }
    toast({ title: "Updated", description: `${data.name} updated` });
    setEditingId(null);
    fetchDepartments(form.location_id);
  };

  const handleDelete = async (id: string) => {
    if (!isAdmin) {
      toast({
        title: "Unauthorized",
        description: "Only admins can delete departments",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("departments").delete().eq("id", id);
    setLoading(false);
    if (error) {
      console.error(error);
      toast({ title: "Error", description: "Failed to delete department", variant: "destructive" });
      return;
    }
    toast({ title: "Deleted", description: `Department deleted` });
    fetchDepartments(form.location_id);
  };

  if (checkingAdmin) {
    return (
      <Layout>
        <div className="container mx-auto py-8">
          <div className="text-center text-muted-foreground">Checking permissions...</div>
        </div>
      </Layout>
    );
  }

  if (!isAdmin) {
    return (
      <Layout>
        <div className="container mx-auto py-8">
          <Card>
            <CardHeader>
              <CardTitle>Not authorized</CardTitle>
              <CardDescription>Only administrators can manage departments.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                You do not have permission to view this page.
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto py-8">
        <Card>
          <CardHeader>
            <CardTitle>Add Department</CardTitle>
            <CardDescription>
              Add departments under a specific location (Admin only)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium">Location</label>
                <Select
                  value={form.location_id}
                  onValueChange={(v) => setForm((p) => ({ ...p, location_id: v }))}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="block text-sm font-medium">Department Name</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  className="h-10"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Prefix (optional)</label>
                <Input
                  value={form.prefix}
                  onChange={(e) => setForm((p) => ({ ...p, prefix: e.target.value }))}
                  className="h-10"
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <Button onClick={handleCreate} disabled={loading}>
                {loading ? "Creating..." : "Create Department"}
              </Button>
            </div>

            <div className="mt-6">
              <h4 className="font-semibold mb-2">Departments in selected location</h4>
              <div className="space-y-2">
                {departments.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    No departments found for this location.
                  </div>
                )}
                {departments.map((d) => (
                  <div key={d.id} className="p-2 border rounded flex justify-between items-center">
                    <div className="flex-1">
                      {editingId === d.id ? (
                        <div className="grid grid-cols-2 gap-2">
                          <Input
                            value={editForm.name}
                            onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                            className="h-9"
                          />
                          <Input
                            value={editForm.prefix}
                            onChange={(e) => setEditForm((p) => ({ ...p, prefix: e.target.value }))}
                            className="h-9"
                          />
                        </div>
                      ) : (
                        <>
                          <div className="font-medium">{d.name}</div>
                          {d.prefix && (
                            <div className="text-sm text-muted-foreground">Prefix: {d.prefix}</div>
                          )}
                        </>
                      )}
                    </div>
                    <div className="ml-4 flex items-center gap-2">
                      {editingId === d.id ? (
                        <>
                          <Button size="sm" onClick={() => handleUpdate(d.id)} disabled={loading}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelEdit}>
                            Cancel
                          </Button>
                        </>
                      ) : isAdmin ? (
                        <>
                          <Button size="sm" onClick={() => startEdit(d)}>
                            Edit
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive">
                                Delete
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete Department</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{d.name}"? This action cannot be
                                  undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(d.id)}
                                  className="bg-destructive text-destructive-foreground"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
