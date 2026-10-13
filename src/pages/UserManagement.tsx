import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Check, Users, Trash2, Plus, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createAdminUser } from "@/lib/admin/users.functions";
import type { AppRole } from "@/lib/admin/users.functions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { usePagination } from "@/hooks/use-pagination";
import { PaginationControls } from "@/components/PaginationControls";
import { createPaginatedQuery } from "@/lib/utils";

interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  user_roles: { role: string; department_id?: string | null }[];
}

const UserManagement = () => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [userToDelete, setUserToDelete] = useState<UserProfile | null>(null);
  const [adminCount, setAdminCount] = useState(0);
  const [principleCount, setPrincipleCount] = useState(0);
  const [librarianCount, setLibrarianCount] = useState(0);
  const [hodCount, setHodCount] = useState(0);
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<Record<string, string>>({});
  const { toast } = useToast();

  // Add User Dialog State
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState<{
    fullName: string;
    email: string;
    role: AppRole;
    departmentId: string;
  }>({
    fullName: "",
    email: "",
    role: "viewer",
    departmentId: "",
  });

  const { pagination, setPage, setPageSize, setTotal } = usePagination(10, 1);

  useEffect(() => {
    fetchUsers();
  }, [pagination.page, pagination.pageSize]);

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      setDepartments(data || []);
    } catch (e) {
      console.error("Failed to load departments:", e);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const {
        data: profiles,
        error: profilesError,
        count,
      } = await supabase
        .from("profiles")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(
          (pagination.page - 1) * pagination.pageSize,
          pagination.page * pagination.pageSize - 1,
        );

      if (profilesError) throw profilesError;

      // Get user roles separately
      const { data: roles, error: rolesError } = await supabase.from("user_roles").select("*");

      if (rolesError) throw rolesError;

      // Combine profiles with roles
      const usersWithRoles =
        profiles?.map((profile) => ({
          ...profile,
          user_roles: roles?.filter((role) => role.user_id === profile.id) || [],
        })) || [];

      setUsers(usersWithRoles);
      setTotal(count || 0);

      // Fetch admin count separately
      const { count: adminCountResult } = await supabase
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "admin");

      setAdminCount(adminCountResult || 0);

      // Fetch principle count separately
      const { count: principleCountResult } = await supabase
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "principle");

      setPrincipleCount(principleCountResult || 0);

      // Fetch librarian count separately
      const { count: librarianCountResult } = await supabase
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "librarian");

      setLibrarianCount(librarianCountResult || 0);

      // Fetch HOD count separately
      const { count: hodCountResult } = await supabase
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "hod");

      setHodCount(hodCountResult || 0);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const promoteToAdmin = async (userId: string, email?: string | null) => {
    try {
      // Ensure roles are exclusive: remove principle/viewer/librarian then add admin
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .in("role", ["principle", "viewer", "librarian", "hod"]);

      if (deleteError) throw deleteError;

      const { error: insertError } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: "admin" });

      if (insertError) throw insertError;

      // Update local state to only admin
      setUsers((prev) =>
        prev.map((user) => {
          if (user.id === userId) {
            return {
              ...user,
              user_roles: [{ role: "admin" }],
            };
          }
          return user;
        }),
      );

      toast({
        title: "User promoted",
        description: `${email} has been promoted to admin.`,
      });
    } catch (error: any) {
      console.error("Error promoting user:", error);
      toast({
        variant: "destructive",
        title: "Promotion failed",
        description: error.message || "Failed to promote user to admin.",
      });
    }
  };

  const setUserRole = async (
    userId: string,
    email: string | null | undefined,
    newRole: string,
    departmentId?: string,
  ) => {
    try {
      // Find management department if needed for non-academic roles
      const mgmtDept = departments.find(
        (d) => d.name.toLowerCase() === "management" || d.name.toLowerCase().includes("management"),
      );

      // Determine the department_id to store
      let finalDeptId: string | null = null;
      if (newRole === "hod" || newRole === "faculty") {
        finalDeptId = departmentId || null;
      } else {
        finalDeptId = departmentId || mgmtDept?.id || null;
      }

      // Delete existing roles for this user
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      if (deleteError) throw deleteError;

      // Insert new role
      const insertPayload: any = {
        user_id: userId,
        role: newRole,
      };
      if (finalDeptId) {
        insertPayload.department_id = finalDeptId;
      }

      const { error: insertError } = await supabase
        .from("user_roles")
        .insert(insertPayload);

      if (insertError) throw insertError;

      // Update local state
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id === userId) {
            return {
              ...u,
              user_roles: [
                {
                  role: newRole,
                  department_id: finalDeptId,
                },
              ],
            };
          }
          return u;
        }),
      );

      toast({
        title: "User Role Updated",
        description: `${email} has been updated to ${newRole}.`,
      });
    } catch (error: any) {
      console.error("Error changing user role:", error);
      toast({
        variant: "destructive",
        title: "Role change failed",
        description: error.message || "Failed to change user role.",
      });
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserForm.email || !newUserForm.fullName) {
      toast({
        variant: "destructive",
        title: "Validation Error",
        description: "Name and email are required.",
      });
      return;
    }

    try {
      setCreatingUser(true);
      // Auto-assign management department for non-academic roles if no department selected
      const mgmtDept = departments.find(
        (d) => d.name.toLowerCase() === "management" || d.name.toLowerCase().includes("management"),
      );
      let chosenDeptId: string | null = null;
      if (newUserForm.role === "hod" || newUserForm.role === "faculty") {
        chosenDeptId = newUserForm.departmentId || null;
      } else {
        chosenDeptId = newUserForm.departmentId || mgmtDept?.id || null;
      }

      const res = await createAdminUser({
        data: {
          email: newUserForm.email,
          full_name: newUserForm.fullName,
          password: "Password@123",
          role: newUserForm.role,
          department_id: chosenDeptId,
        },
      });

      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "User Creation Failed",
          description: res.error,
        });
        return;
      }

      toast({
        title: "User Created Successfully",
        description: `${newUserForm.fullName} (${newUserForm.email}) added with default password Password@123.`,
      });

      setShowAddUserModal(false);
      setNewUserForm({
        fullName: "",
        email: "",
        role: "viewer",
        departmentId: "",
      });

      // Refresh users list
      await fetchUsers();
    } catch (err: any) {
      console.error("Failed to create user:", err);
      toast({
        variant: "destructive",
        title: "Error",
        description: err.message || "An unexpected error occurred.",
      });
    } finally {
      setCreatingUser(false);
    }
  };

  const deleteUser = async (userId: string, email?: string | null) => {
    try {
      // Delete from user_roles first
      const { error: rolesError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      if (rolesError) throw rolesError;

      // Delete from profiles
      const { error: profileError } = await supabase.from("profiles").delete().eq("id", userId);

      if (profileError) throw profileError;

      // Update local state
      setUsers((prev) => prev.filter((u) => u.id !== userId));

      toast({
        title: "User deleted",
        description: `${email} has been deleted successfully.`,
      });

      setUserToDelete(null);
    } catch (error: any) {
      console.error("Error deleting user:", error);
      toast({
        variant: "destructive",
        title: "Deletion failed",
        description: error.message || "Failed to delete user.",
      });
    }
  };

  const getUserRole = (userRoles: { role: string }[]) => {
    if (!userRoles || userRoles.length === 0) return "Pending";
    const primary = userRoles[0]?.role;
    if (!primary) return "Pending";
    // Format role into readable label
    switch (primary) {
      case "admin": return "Admin";
      case "principal":
      case "principle": return "Principal";
      case "hod": return "HOD";
      case "librarian": return "Librarian";
      case "viewer": return "Viewer";
      case "faculty": return "Faculty";
      case "requester": return "Requester";
      case "stores": return "Stores";
      case "finance": return "Finance";
      case "procurement_officer": return "Procurement Officer";
      case "procurement_executive": return "Procurement Executive";
      case "purchase_committee": return "Purchase Committee";
      case "evp": return "EVP";
      case "director_admin_finance": return "Director Admin & Finance";
      default: return primary.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  };

  const getRoleBadge = (user: UserProfile) => {
    const role = getUserRole(user.user_roles);
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      Admin: "default",
      Principal: "secondary",
      HOD: "secondary",
      Librarian: "secondary",
      Viewer: "outline",
      Pending: "outline",
    };

    return <Badge variant={variants[role] || "secondary"}>{role}</Badge>;
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">User Management</h2>
              <p className="text-muted-foreground">Manage user registrations and approvals</p>
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">User Management</h2>
            <p className="text-muted-foreground">Manage user roles and permissions</p>
          </div>
          <Button
            onClick={() => setShowAddUserModal(true)}
            className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
          >
            <UserPlus className="w-4 h-4" />
            Add User
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{pagination.total}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Admin Users</CardTitle>
              <Check className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{adminCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Principle Users</CardTitle>
              <Check className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{principleCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Librarian Users</CardTitle>
              <Check className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{librarianCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">HOD Users</CardTitle>
              <Check className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{hodCount}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Registration Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No users found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">{user.full_name || "N/A"}</TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{getRoleBadge(user)}</TableCell>
                        <TableCell>
                          {(() => {
                            const userRole = user.user_roles?.[0]?.role;
                            const deptId = user.user_roles?.[0]?.department_id;
                            const isAcademicRole = userRole === "hod" || userRole === "faculty";

                            // Show department Select dropdown for HOD and Faculty
                            if (isAcademicRole || selectedDepartments[user.id] !== undefined) {
                              return (
                                <Select
                                  value={selectedDepartments[user.id] ?? deptId ?? ""}
                                  onValueChange={(newDeptId) => {
                                    setSelectedDepartments((p) => ({ ...p, [user.id]: newDeptId }));
                                    const currentRole = userRole || "faculty";
                                    setUserRole(user.id, user.email, currentRole, newDeptId);
                                  }}
                                >
                                  <SelectTrigger className="w-48">
                                    <SelectValue placeholder="Select dept" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {departments.map((d) => (
                                      <SelectItem key={d.id} value={d.id}>
                                        {d.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              );
                            }

                            // For non-HOD and non-Faculty, display their department name or default to "Management"
                            const dept = departments.find((d) => d.id === deptId);
                            if (dept) return dept.name;
                            return "Management";
                          })()}
                        </TableCell>
                        <TableCell>{new Date(user.created_at).toLocaleDateString()}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {getUserRole(user.user_roles) === "Pending" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => promoteToAdmin(user.id, user.email)}
                              >
                                Set to Admin
                              </Button>
                            )}
                            {getUserRole(user.user_roles) !== "Pending" && (
                              <Select
                                value={user.user_roles?.[0]?.role || "viewer"}
                                onValueChange={(value) => {
                                  const currentDept = user.user_roles?.[0]?.department_id;
                                  if (value === "hod" || value === "faculty") {
                                    setUserRole(user.id, user.email, value, currentDept || undefined);
                                    setSelectedDepartments((p) => ({
                                      ...p,
                                      [user.id]: p[user.id] || currentDept || "",
                                    }));
                                  } else {
                                    setSelectedDepartments((p) => {
                                      const copy = { ...p };
                                      delete copy[user.id];
                                      return copy;
                                    });
                                    setUserRole(user.id, user.email, value);
                                  }
                                }}
                              >
                                <SelectTrigger className="w-36">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="principal">Principal</SelectItem>
                                  <SelectItem value="hod">HOD</SelectItem>
                                  <SelectItem value="faculty">Faculty</SelectItem>
                                  <SelectItem value="librarian">Librarian</SelectItem>
                                  <SelectItem value="procurement_officer">Procurement Officer</SelectItem>
                                  <SelectItem value="procurement_executive">Procurement Executive</SelectItem>
                                  <SelectItem value="purchase_committee">Purchase Committee</SelectItem>
                                  <SelectItem value="stores">Stores</SelectItem>
                                  <SelectItem value="finance">Finance</SelectItem>
                                  <SelectItem value="evp">EVP</SelectItem>
                                  <SelectItem value="director_admin_finance">Director (Admin & Fin)</SelectItem>
                                  <SelectItem value="requester">Requester</SelectItem>
                                  <SelectItem value="user">User</SelectItem>
                                  <SelectItem value="viewer">Viewer</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setUserToDelete(user)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete User</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete {userToDelete?.email}? This
                                    action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel onClick={() => setUserToDelete(null)}>
                                    Cancel
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() =>
                                      userToDelete &&
                                      deleteUser(userToDelete.id, userToDelete.email)
                                    }
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

        {/* Add User Modal */}
        <Dialog open={showAddUserModal} onOpenChange={setShowAddUserModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                <UserPlus className="w-5 h-5 text-indigo-600" />
                Add New User
              </DialogTitle>
              <DialogDescription>
                Create a new user account in Supabase and configure their institutional role and department.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleCreateUser} className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-fullname">Full Name *</Label>
                <Input
                  id="new-fullname"
                  required
                  placeholder="e.g. Dr. Ramesh Kumar"
                  value={newUserForm.fullName}
                  onChange={(e) =>
                    setNewUserForm((prev) => ({ ...prev, fullName: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-email">Email Address *</Label>
                <Input
                  id="new-email"
                  type="email"
                  required
                  placeholder="e.g. ramesh.kumar@institution.edu"
                  value={newUserForm.email}
                  onChange={(e) =>
                    setNewUserForm((prev) => ({ ...prev, email: e.target.value }))
                  }
                />
              </div>

              <div className="p-3 bg-muted/40 rounded-lg border border-border/50 text-xs text-muted-foreground flex flex-col gap-1">
                <span className="font-semibold text-foreground">Default Credentials:</span>
                <span>The initial password for this account will be automatically set to <strong className="text-foreground font-mono">Password@123</strong>.</span>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-role">Assign Role *</Label>
                <Select
                  value={newUserForm.role}
                  onValueChange={(val) => {
                    const role = val as AppRole;
                    // Auto-select Management department for non-academic roles if empty
                    const mgmtDept = departments.find(
                      (d) => d.name.toLowerCase() === "management" || d.name.toLowerCase().includes("management"),
                    );
                    setNewUserForm((prev) => ({
                      ...prev,
                      role,
                      departmentId:
                        role === "hod" || role === "faculty"
                          ? prev.departmentId
                          : prev.departmentId || mgmtDept?.id || "",
                    }));
                  }}
                >
                  <SelectTrigger id="new-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="principal">Principal</SelectItem>
                    <SelectItem value="hod">HOD (Head of Department)</SelectItem>
                    <SelectItem value="faculty">Faculty</SelectItem>
                    <SelectItem value="librarian">Librarian</SelectItem>
                    <SelectItem value="procurement_officer">Procurement Officer</SelectItem>
                    <SelectItem value="procurement_executive">Procurement Executive</SelectItem>
                    <SelectItem value="purchase_committee">Purchase Committee</SelectItem>
                    <SelectItem value="stores">Stores / Receiving</SelectItem>
                    <SelectItem value="finance">Finance Officer</SelectItem>
                    <SelectItem value="evp">Executive Vice President (EVP)</SelectItem>
                    <SelectItem value="director_admin_finance">Director (Admin & Finance)</SelectItem>
                    <SelectItem value="requester">Requester</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="new-department">
                  Department {newUserForm.role === "hod" || newUserForm.role === "faculty" ? "*" : "(Defaults to Management)"}
                </Label>
                <Select
                  value={newUserForm.departmentId}
                  onValueChange={(val) =>
                    setNewUserForm((prev) => ({ ...prev, departmentId: val }))
                  }
                >
                  <SelectTrigger id="new-department">
                    <SelectValue placeholder="Choose department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((dept) => (
                      <SelectItem key={dept.id} value={dept.id}>
                        {dept.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  {newUserForm.role === "hod" || newUserForm.role === "faculty"
                    ? "Select the academic/engineering department for this faculty or HOD."
                    : "Non-academic users default to the Management department."}
                </p>
              </div>

              <DialogFooter className="pt-3 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowAddUserModal(false)}
                  disabled={creatingUser}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={creatingUser}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
                >
                  {creatingUser ? "Creating User..." : "Save & Create User"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default UserManagement;
