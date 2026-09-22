import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "../integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { User } from "@supabase/supabase-js";
import { ticketPriorityOptions } from "@/lib/ticketUtils";
import { inventoryApi } from "@/lib/inventoryApi";
import { useAuth } from "@/lib/auth";
import Layout from "@/components/Layout";

const TicketRaiser = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    contactNumber: "",
    department: "",
    issueCategory: "inventory",
    issueDescription: "",
    priority: "medium",
  });
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState<{ value: string; label: string }[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const { toast } = useToast();
  const { departmentId, primaryRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const getUserInfo = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        toast({
          title: "Error",
          description: "Please log in to raise a ticket",
          variant: "destructive",
        });
        navigate({ to: "/auth" });
        return;
      }

      // Fetch user profile to get name
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .single();

      if (profile) {
        setFormData((prev) => ({
          ...prev,
          name: profile.full_name || "",
          email: profile.email || "",
        }));
      }

      setUser(user);
      setLoading(false);
    };

    getUserInfo();
  }, [navigate, toast]);

  // If user has a HOD-assigned department (via Auth context), autofill the department field
  useEffect(() => {
    let mounted = true;
    const fetchDeptName = async () => {
      try {
        if (!departmentId) return;
        const { data: dept } = await supabase
          .from("departments")
          .select("name")
          .eq("id", departmentId)
          .maybeSingle();
        const deptName = (dept as any)?.name ?? "";
        if (mounted && deptName) {
          setFormData((prev) => ({ ...prev, department: deptName }));
        }
      } catch (err) {
        console.error("Failed to auto-fill department for ticket form", err);
      }
    };

    fetchDeptName();
    return () => {
      mounted = false;
    };
  }, [departmentId]);

  // Load categories scoped to department (HOD-aware) or fallback to global categories
  useEffect(() => {
    let mounted = true;
    const loadCategories = async () => {
      setCategoriesLoading(true);
      try {
        let deptName = "";

        if (departmentId) {
          const { data: dept } = await supabase
            .from("departments")
            .select("name")
            .eq("id", departmentId)
            .maybeSingle();
          deptName = (dept as any)?.name ?? "";
        } else if (formData.department) {
          deptName = formData.department;
        }

        let fetched: { value: string; label: string }[] = [];
        if (deptName) {
          fetched = await inventoryApi.getCategoriesForDepartment(deptName);
        }

        if (!fetched || fetched.length === 0) {
          // fallback to global categories table
          const all = await inventoryApi.getCategories();
          fetched = (all || []).map((c: any) => ({ value: c.name, label: c.name }));
        }

        if (mounted) setCategories(fetched);
      } catch (err) {
        console.error("Error loading categories for ticket form", err);
        if (mounted) setCategories([]);
      } finally {
        if (mounted) setCategoriesLoading(false);
      }
    };

    loadCategories();
    return () => {
      mounted = false;
    };
  }, [departmentId, formData.department]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | { name: string; value: string },
  ) => {
    if ("target" in e) {
      const { name, value } = e.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
    } else {
      const { name, value } = e;
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Ensure user is authenticated
      if (!user) {
        throw new Error("User not authenticated");
      }

      // Try to get a server-generated ticket number (preferred).
      let ticketNumber: string | null = null;
      try {
        const { data: ticketData, error: ticketError } =
          await supabase.rpc("generate_ticket_number");
        if (ticketError) throw ticketError;
        ticketNumber = ticketData as unknown as string;
      } catch (rpcErr) {
        // RPC may be forbidden due to permissions; fall back to a safe client-side ticket number
        console.warn(
          "generate_ticket_number RPC failed, falling back to client-side generation",
          rpcErr,
        );
        const year = new Date().getFullYear();
        const rand = Math.floor(Math.random() * 9000) + 1000;
        ticketNumber = `TKT-${year}-${String(rand).padStart(4, "0")}`;
      }

      // Insert ticket into database (include ticket_number to avoid NOT NULL violation)
      // If the current user is a HOD, send the request to Principal for approval
      const insertPayload: any = {
        ticket_number: ticketNumber,
        name: formData.name,
        email: formData.email,
        contact_number: formData.contactNumber,
        department: formData.department,
        issue_category: formData.issueCategory,
        issue_description: formData.issueDescription,
        priority: formData.priority,
        created_by: user.id,
      };

      if (primaryRole === "hod") {
        insertPayload.status = "pending_principal";
      }

      const { data, error } = await supabase
        .from("tickets")
        .insert([insertPayload])
        .select("ticket_number")
        .single();

      if (error) throw error;

      toast({
        title: primaryRole === "hod" ? "Request Sent" : "Ticket Raised Successfully!",
        description:
          primaryRole === "hod"
            ? `Your request ${data.ticket_number} was sent to Principal for approval`
            : `Your ticket has been raised with number: ${data.ticket_number}`,
      });

      // Reset form
      setFormData((prev) => ({
        ...prev,
        contactNumber: "",
        issueCategory: "inventory",
        issueDescription: "",
        priority: "medium",
      }));
    } catch (error: any) {
      console.error("Error raising ticket:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to raise ticket. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto py-8 px-4 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Raise New Ticket</CardTitle>
            <CardDescription>
              Fill out the form below to raise an issue ticket. You will receive updates on the
              status of your ticket.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  required
                  placeholder="Your full name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="your.email@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="contactNumber">Contact Number</Label>
                <Input
                  id="contactNumber"
                  name="contactNumber"
                  value={formData.contactNumber}
                  onChange={handleChange}
                  placeholder="Your phone number"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input
                  id="department"
                  name="department"
                  value={formData.department}
                  onChange={handleChange}
                  placeholder="Your department"
                  readOnly={primaryRole === "hod"}
                  title={
                    primaryRole === "hod" ? "Department is set from your HOD assignment" : undefined
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="issueCategory">Issue Category</Label>
                <Select
                  value={formData.issueCategory}
                  onValueChange={(value) => handleChange({ name: "issueCategory", value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select issue category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriesLoading ? (
                      <SelectItem value="loading">Loading...</SelectItem>
                    ) : (
                      (categories.length
                        ? categories
                        : [{ value: "inventory", label: "Inventory" }]
                      ).map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  value={formData.priority}
                  onValueChange={(value) => handleChange({ name: "priority", value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select priority level" />
                  </SelectTrigger>
                  <SelectContent>
                    {ticketPriorityOptions.map((priority) => (
                      <SelectItem key={priority.value} value={priority.value}>
                        {priority.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="issueDescription">Issue Description</Label>
                <Textarea
                  id="issueDescription"
                  name="issueDescription"
                  value={formData.issueDescription}
                  onChange={handleChange}
                  required
                  placeholder="Describe your issue in detail..."
                  rows={5}
                />
              </div>

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting
                  ? "Submitting..."
                  : primaryRole === "hod"
                    ? "Request Principal Approval"
                    : "Raise Ticket"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default TicketRaiser;
