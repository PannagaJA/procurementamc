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
import { Check, Users, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
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
  email: string;
  full_name: string;
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

  const {
    pagination,
    setPage,
    setPageSize,
    setTotal,
  } = usePagination(10, 1);

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
      const { data: profiles, error: profilesError, count } = await supabase
        .from("profiles")
        .select("*", { count: 'exact' })
        .order("created_at", { ascending: false })
        .range((pagination.page - 1) * pagination.pageSize, pagination.page * pagination.pageSize - 1);

      if (profilesError) throw profilesError;

      // Get user roles separately
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("*");

      if (rolesError) throw rolesError;

      // Combine profiles with roles
      const usersWithRoles = profiles?.map(profile => ({
        ...profile,
        user_roles: roles?.filter(role => role.user_id === profile.id) || []
      })) || [];

      setUsers(usersWithRoles);
      setTotal(count || 0);

      // Fetch admin count separately
      const { count: adminCountResult } = await supabase
        .from("user_roles")
        .select("*", { count: 'exact', head: true })
        .eq("role", "admin");
      
      setAdminCount(adminCountResult || 0);

      // Fetch principle count separately
      const { count: principleCountResult } = await supabase
        .from("user_roles")
        .select("*", { count: 'exact', head: true })
        .eq("role", "principle");
      
      setPrincipleCount(principleCountResult || 0);

      // Fetch librarian count separately
      const { count: librarianCountResult } = await supabase
        .from("user_roles")
        .select("*", { count: 'exact', head: true })
        .eq("role", "librarian");

      setLibrarianCount(librarianCountResult || 0);

      // Fetch HOD count separately
      const { count: hodCountResult } = await supabase
        .from("user_roles")
        .select("*", { count: 'exact', head: true })
        .eq("role", "hod");

      setHodCount(hodCountResult || 0);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const promoteToAdmin = async (userId: string, email: string) => {
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
      setUsers(prev => prev.map(user => {
        if (user.id === userId) {
          return {
            ...user,
            user_roles: [{ role: "admin" }]
          };
        }
        return user;
      }));

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

  const setUserRole = async (userId: string, email: string, newRole: string, departmentId?: string) => {
    try {
      const user = users.find(u => u.id === userId);
      
      if (newRole === "admin") {
        // Remove principle, viewer and librarian roles, then add admin
        const { error: deleteError } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .in("role", ["principle", "viewer", "librarian", "hod"]);

        if (deleteError) throw deleteError;

        if (!user?.user_roles?.some(r => r.role === "admin")) {
          const { error: insertError } = await supabase
            .from("user_roles")
            .insert({ user_id: userId, role: "admin" });
          if (insertError) throw insertError;
        }

        // Update local state
        setUsers(prev => prev.map(u => {
          if (u.id === userId) {
            return {
              ...u,
              user_roles: [
                ...(u.user_roles?.filter(r => r.role !== "principle") || []),
                { role: "admin" }
              ]
            };
          }
          return u;
        }));

        toast({
          title: "User promoted",
          description: `${email} has been promoted to admin.`,
        });
      } else if (newRole === "principle") {
        // Remove admin, viewer and librarian roles, then add principle
        const { error: deleteError } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .in("role", ["admin", "viewer", "librarian", "hod"]);

        if (deleteError) throw deleteError;

        if (!user?.user_roles?.some(r => r.role === "principle")) {
          const { error: insertError } = await supabase
            .from("user_roles")
            .insert({ user_id: userId, role: "principle" });
          if (insertError) throw insertError;
        }

        setUsers(prev => prev.map(u => {
          if (u.id === userId) {
            return { ...u, user_roles: [{ role: "principle" }] };
          }
          return u;
        }));

        toast({ title: "User role updated", description: `${email} has been set as principle.` });
      } else if (newRole === "librarian") {
        // Remove admin and principle and viewer roles, then add librarian
        const { error: deleteError } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .in("role", ["admin", "viewer", "principle", "hod"]);

        if (deleteError) throw deleteError;

        if (!user?.user_roles?.some(r => r.role === "librarian")) {
          const { error } = await supabase
            .from("user_roles")
            .insert({ user_id: userId, role: "librarian" });
          if (error) throw error;
        }

        setUsers(prev => prev.map(u => {
          if (u.id === userId) {
            return { ...u, user_roles: [{ role: "librarian" }] };
          }
          return u;
        }));

        toast({ title: "User role updated", description: `${email} has been set as librarian.` });

      } else if (newRole === "viewer") {
        // Remove admin, principle and librarian roles then ensure a viewer role exists
        const { error: deleteError } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .in("role", ["admin", "principle", "librarian", "hod"]);

        if (deleteError) throw deleteError;

        // Insert viewer role if not present
        if (!user?.user_roles?.some(r => r.role === "viewer")) {
          const { error: insertError } = await supabase
            .from("user_roles")
            .insert({ user_id: userId, role: "viewer" });
          if (insertError) throw insertError;
        }

        setUsers(prev => prev.map(u => {
          if (u.id === userId) {
            return { ...u, user_roles: [{ role: "viewer" }] };
          }
          return u;
        }));

        toast({ title: "User demoted", description: `${email} has been demoted to viewer.` });
      } else if (newRole === "hod") {
        // Remove other roles, then add hod with optional department
        const { error: deleteError } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", userId)
          .in("role", ["admin", "principle", "viewer", "librarian"]);

        if (deleteError) throw deleteError;

        if (!user?.user_roles?.some(r => r.role === "hod")) {
          const insertPayload: any = { user_id: userId, role: "hod" };
          if (departmentId) insertPayload.department_id = departmentId;
          const { error } = await supabase
            .from("user_roles")
            .insert(insertPayload);
          if (error) throw error;
        } else {
          // ensure department is updated if present
          if (departmentId) {
            const { error } = await supabase
              .from("user_roles")
              .update({ department_id: departmentId })
              .eq("user_id", userId)
              .eq("role", "hod");
            if (error) throw error;
          }
        }

        setUsers(prev => prev.map(u => {
          if (u.id === userId) {
            return { ...u, user_roles: [{ role: "hod", department_id: departmentId || null }] };
          }
          return u;
        }));

        toast({ title: "User role updated", description: `${email} has been set as HOD.` });
      }
    } catch (error: any) {
      console.error("Error changing user role:", error);
      try {
        console.error("Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
      } catch (e) {
        // ignore stringify errors
      }
      // If the remote DB doesn't have department_id yet (migration not applied),
      // fall back to retrying the HOD insert without department_id so the UI remains usable.
      const msg = (error && (error.message || error.error || '')).toString();
      if ((error && (error.code === 'PGRST204' || msg.includes("Could not find the 'department_id' column"))) && (newRole === 'hod')) {
        try {
          // Retry without department_id
          const { error: fallbackError } = await supabase
            .from('user_roles')
            .insert({ user_id: userId, role: 'hod' });
          if (fallbackError) throw fallbackError;

          setUsers(prev => prev.map(u => {
            if (u.id === userId) {
              return { ...u, user_roles: [{ role: 'hod' }] };
            }
            return u;
          }));

          toast({ title: "User role updated", description: `${email} has been set as HOD (department will be available after migration).` });
          return;
        } catch (fallbackErr: any) {
          console.error('Fallback insert failed:', fallbackErr);
          // If the insert failed due to unique constraint, the role likely already exists
          // but the earlier PATCH/update failed because the remote schema lacks department_id.
          // Mark the user locally as HOD so the UI reflects the role, and inform the user
          // to sync/apply migrations to enable department assignments.
          if (fallbackErr && (fallbackErr.code === '23505' || (fallbackErr.message || '').includes('duplicate key value'))) {
            setUsers(prev => prev.map(u => {
              if (u.id === userId) {
                return { ...u, user_roles: [{ role: 'hod' }] };
              }
              return u;
            }));

            toast({
              title: 'User role updated (partial)',
              description: 'User set as HOD locally. Run the DB migration to enable department assignments.',
            });
            return;
          }

          toast({ variant: 'destructive', title: 'Role change failed', description: fallbackErr.message || 'Failed to change user role.' });
          return;
        }
      }

      toast({
        variant: "destructive",
        title: "Role change failed",
        description: error.message || "Failed to change user role.",
      });
    }
  };

  const deleteUser = async (userId: string, email: string) => {
    try {
      // Delete from user_roles first
      const { error: rolesError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      if (rolesError) throw rolesError;

      // Delete from profiles
      const { error: profileError } = await supabase
        .from("profiles")
        .delete()
        .eq("id", userId);

      if (profileError) throw profileError;

      // Update local state
      setUsers(prev => prev.filter(u => u.id !== userId));

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
    if (userRoles.some(r => r.role === "admin")) return "Admin";
    if (userRoles.some(r => r.role === "principle")) return "Principle";
    if (userRoles.some(r => r.role === "hod")) return "HOD";
    if (userRoles.some(r => r.role === "librarian")) return "Librarian";
    return "Viewer";
  };

  const getRoleBadge = (user: UserProfile) => {
    const role = getUserRole(user.user_roles);
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      "Admin": "default",
      "Principle": "secondary",
      "HOD": "secondary",
      "Librarian": "secondary",
      "Viewer": "secondary",
      "Pending": "outline",
    };

    return (
      <Badge variant={variants[role] || "outline"}>
        {role}
      </Badge>
    );
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">User Management</h2>
            <p className="text-muted-foreground">Manage user roles and permissions</p>
          </div>
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
                        <TableCell className="font-medium">
                          {user.full_name || "N/A"}
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>{getRoleBadge(user)}</TableCell>
                        <TableCell>
                          {
                            (() => {
                              const hodRole = user.user_roles?.find(r => r.role === 'hod');
                              const deptId = hodRole?.department_id;
                              // show department Select only when role is HOD or when a selection is pending
                              if (getUserRole(user.user_roles) === 'HOD' || selectedDepartments[user.id] !== undefined) {
                                return (
                                  <Select
                                    value={selectedDepartments[user.id] ?? deptId ?? ""}
                                    onValueChange={(deptId) => {
                                      setSelectedDepartments((p) => ({ ...p, [user.id]: deptId }));
                                      // persist department for existing HOD role
                                      if (getUserRole(user.user_roles) === 'HOD') {
                                        setUserRole(user.id, user.email, 'hod', deptId);
                                      }
                                    }}
                                  >
                                    <SelectTrigger className="w-48">
                                      <SelectValue placeholder="Select dept" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {departments.map(d => (
                                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                );
                              }

                              const dept = departments.find((d) => d.id === deptId);
                              return dept ? dept.name : (deptId ? deptId : '-');
                            })()
                          }
                        </TableCell>
                        <TableCell>
                          {new Date(user.created_at).toLocaleDateString()}
                        </TableCell>
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
                                value={getUserRole(user.user_roles).toLowerCase()}
                                onValueChange={(value) => {
                                  if (value === 'hod') {
                                    // set role to HOD; department can be selected in the Department column
                                    setUserRole(user.id, user.email, 'hod');
                                    setSelectedDepartments((p) => ({ ...p, [user.id]: p[user.id] || '' }));
                                  } else {
                                    // clearing any selected department state when not HOD
                                    setSelectedDepartments((p) => {
                                      const copy = { ...p };
                                      delete copy[user.id];
                                      return copy;
                                    });
                                    setUserRole(user.id, user.email, value);
                                  }
                                }}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="admin">Admin</SelectItem>
                                  <SelectItem value="principle">Principle</SelectItem>
                                  <SelectItem value="librarian">Librarian</SelectItem>
                                  <SelectItem value="hod">HOD</SelectItem>
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
                                    Are you sure you want to delete {userToDelete?.email}? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel onClick={() => setUserToDelete(null)}>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => userToDelete && deleteUser(userToDelete.id, userToDelete.email)}
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
    </Layout>
  );
};

export default UserManagement;