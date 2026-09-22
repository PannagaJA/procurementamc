import { useState, useEffect, useCallback } from "react";
import { useParams } from "@tanstack/react-router";
import { useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, CheckCircle, Clock, DollarSign, Package, Truck, User } from "lucide-react";
import { Phone } from "lucide-react";

// Helper to extract labeled values from the response description text
function extractFromDescription(desc: string, label: string) {
  if (!desc) return null;
  const regex = new RegExp(`${label}:\\s*([^\\n\\r]+)`, "i");
  const m = desc.match(regex);
  return m ? m[1].trim() : null;
}

const responseSchema = z.object({
  description: z.string().min(10, "Description must be at least 10 characters"),
  totalAmount: z
    .string()
    .min(1, "Total amount is required")
    .refine((val) => {
      const num = parseFloat(val);
      return !isNaN(num) && num > 0;
    }, "Total amount must be a valid number greater than 0"),
  deliveryTime: z.string().min(1, "Delivery time is required"),
  contactPerson: z.string().min(1, "Contact person is required"),
  contactPhone: z
    .string()
    .min(5, "Contact phone is required")
    .refine((v) => {
      // basic phone validation: allow digits, spaces, +, -, (, )
      return /^[0-9+()\s-]{5,}$/.test(v);
    }, "Enter a valid phone number"),
  paymentTerms: z.string().min(1, "Payment terms are required"),
  additionalNotes: z.string().optional(),
  quotationValidity: z
    .string()
    .min(1, "Quotation validity date is required")
    .refine((val) => !isNaN(Date.parse(val)), "Enter a valid date"),
  termsAccepted: z
    .boolean()
    .refine((v) => v === true, "You must accept the Terms & Conditions to submit"),
});

type ResponseForm = z.infer<typeof responseSchema>;

export default function QuotationResponse() {
  const { id } = useParams({ strict: false }) as { id: string };
  const location = useLocation();
  const { primaryRole } = useAuth();
  const [quotation, setQuotation] = useState<{
    id: string;
    category_id?: string | null;
    company_email?: string | null;
    description?: string | null;
    product_name?: string | null;
    quantity?: number | null;
    last_reply_date?: string | null;
    status?: string | null;
    admin_status?: string | null;
    categories?: { name: string } | null;
  } | null>(null);
  const [existingResponse, setExistingResponse] = useState<{
    id: string;
    quotation_id: string;
    company_email?: string | null;
    description?: string | null;
    total_amount?: number | null;
    submitted_at?: string | null;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<ResponseForm>({
    resolver: zodResolver(responseSchema),
    defaultValues: {
      description: "",
      totalAmount: "",
      deliveryTime: "",
      contactPerson: "",
      contactPhone: "",
      paymentTerms: "",
      additionalNotes: "",
      quotationValidity: "",
      termsAccepted: false,
    },
  });

  const fetchQuotationAndResponse = useCallback(async () => {
    if (!id) return;

    try {
      // Fetch quotation with admin_status
      const { data: quotationData, error: quotationError } = await supabase
        .from("quotations")
        .select(
          `
          *,
          categories (name)
        `,
        )
        .eq("id", id)
        .single();

      if (quotationError) {
        console.error("Error fetching quotation:", quotationError);
        throw quotationError;
      }

      setQuotation(quotationData);

      // Fetch existing response if any
      const { data: responseData, error: responseError } = await supabase
        .from("quotation_responses")
        .select("*")
        .eq("quotation_id", id)
        .maybeSingle();

      console.log("Response query result:", { responseData, responseError });
      console.log("Quotation data:", quotationData);

      if (responseError) {
        console.error("Error fetching response:", responseError);
        // If there's any error, treat as no response
      } else if (responseData) {
        console.log("Found existing response:", responseData);
        setExistingResponse(responseData);
      } else {
        console.log("No existing response found");
        // If status is 'responded' but no response exists, reset status to 'sent'
        if (quotationData.status === "responded") {
          console.log("Status is responded but no response found, resetting status");
          await supabase.from("quotations").update({ status: "sent" }).eq("id", id);
          quotationData.status = "sent";
        }
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        title: "Error",
        description: "Failed to load quotation details",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [id, toast]);

  useEffect(() => {
    fetchQuotationAndResponse();
  }, [fetchQuotationAndResponse]);

  const onSubmit = async (data: ResponseForm) => {
    console.log("onSubmit called with data:", data);
    if (!quotation) {
      console.log("No quotation found");
      return;
    }

    // Check if quotation has expired
    const deadline = quotation.last_reply_date
      ? new Date(quotation.last_reply_date)
      : new Date(8640000000000000);
    const now = new Date();
    if (now > deadline) {
      toast({
        title: "Quotation Expired",
        description: "The response deadline for this quotation has passed.",
        variant: "destructive",
      });
      return;
    }

    // Check if quotation is still pending
    if (quotation.status !== "sent") {
      toast({
        title: "Already Responded",
        description: "This quotation has already been responded to or is no longer active.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const responseData = {
        quotation_id: quotation.id,
        company_email: quotation.company_email,
        description: `${data.description}\n\nDelivery Time: ${data.deliveryTime}\nContact Person: ${data.contactPerson}\nContact Phone: ${data.contactPhone}\nPayment Terms: ${data.paymentTerms}${data.additionalNotes ? `\n\nAdditional Notes: ${data.additionalNotes}` : ""}`,
        total_amount: parseFloat(data.totalAmount),
        quotation_validity: data.quotationValidity || null,
        terms_accepted: data.termsAccepted === true,
      };

      console.log("Attempting to insert response:", responseData);

      const { data: insertedResponse, error } = await supabase
        .from("quotation_responses")
        .insert(responseData)
        .select()
        .single();

      console.log("Insert result:", { insertedResponse, error });

      if (error) {
        console.error("Insert error:", error);
        // Check for duplicate key error
        if (error.code === "23505") {
          toast({
            title: "Already Responded",
            description: "You have already submitted a response for this quotation.",
            variant: "destructive",
          });
          return;
        }
        throw error;
      }

      // Update quotation status
      const { error: updateError } = await supabase
        .from("quotations")
        .update({ status: "responded" })
        .eq("id", quotation.id);

      console.log("Status update result:", { updateError });

      if (updateError) {
        console.error("Update error:", updateError);
        // Don't throw here as the response was already inserted
      }

      toast({
        title: "Success",
        description: "Your quotation response has been submitted successfully!",
      });

      // Update local state to reflect the changes
      setQuotation((prev) => (prev ? { ...prev, status: "responded" } : null));
      setExistingResponse(insertedResponse);

      console.log("Local state updated:", { newStatus: "responded", response: insertedResponse });

      form.reset();
    } catch (error) {
      console.error("Error submitting response:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to submit response. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-8">
            <div className="text-center">Loading quotation details...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!quotation) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-red-500">Quotation not found</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isExpired = quotation?.last_reply_date
    ? new Date() > new Date(quotation.last_reply_date)
    : false;
  const hasResponded = quotation ? quotation.status === "responded" && !!existingResponse : false;

  console.log("UI State:", {
    quotationStatus: quotation?.status,
    hasExistingResponse: !!existingResponse,
    existingResponse: existingResponse,
    hasResponded,
    isExpired,
  });

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <Card>
        <CardHeader
          className={`${
            isExpired
              ? "bg-red-50"
              : hasResponded
                ? "bg-green-50"
                : "bg-gradient-to-r from-blue-50 to-indigo-50"
          }`}
        >
          <div className="flex items-center gap-4">
            <img src="/amc.jpeg" alt="AMC Logo" className="h-12 w-12 rounded-lg" />
            <div>
              <CardTitle className="flex items-center gap-2">
                {hasResponded ? "Quotation Response Submitted" : "Submit Quotation Response"}
                {isExpired && <span className="text-red-600 text-sm font-normal">(Expired)</span>}
                {hasResponded && (
                  <span className="text-green-600 text-sm font-normal">(Response Submitted)</span>
                )}
              </CardTitle>
              <CardDescription>
                {isExpired
                  ? "This quotation has expired and is no longer accepting responses."
                  : hasResponded
                    ? "Your quotation response has been submitted successfully."
                    : "Please provide detailed information about your quotation for the requested item"}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Quotation Details Section */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Quotation Request Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-gray-500" />
                <div>
                  <label className="text-sm font-medium">Category</label>
                  <p className="text-sm text-muted-foreground">{quotation.categories?.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-gray-500" />
                <div>
                  <label className="text-sm font-medium">Product Name</label>
                  <p className="text-sm text-muted-foreground">{quotation.product_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-gray-500" />
                <div>
                  <label className="text-sm font-medium">Quantity</label>
                  <p className="text-sm text-muted-foreground">{quotation.quantity} units</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-500" />
                <div>
                  <label className="text-sm font-medium">Response Deadline</label>
                  <p className="text-sm text-muted-foreground">
                    {quotation.last_reply_date
                      ? new Date(quotation.last_reply_date).toLocaleDateString()
                      : "N/A"}
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <label className="text-sm font-medium">Request Description</label>
              <p className="text-sm text-muted-foreground bg-white p-3 rounded border mt-1">
                {quotation.description}
              </p>
            </div>
          </div>

          {hasResponded ? (
            /* Submitted Response Details Section */
            <div className="border-t pt-6">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Your Submitted Response
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Total Amount
                    </label>
                    <p className="text-lg font-semibold text-green-600">
                      ₹{existingResponse?.total_amount || "N/A"}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Truck className="h-4 w-4" />
                      Delivery Time
                    </label>
                    <p className="text-sm text-muted-foreground">
                      {extractFromDescription(
                        existingResponse?.description || "",
                        "Delivery Time",
                      ) || "Not specified"}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Contact Person
                    </label>
                    <p className="text-sm text-muted-foreground">
                      {extractFromDescription(
                        existingResponse?.description || "",
                        "Contact Person",
                      ) || "Not specified"}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Contact Phone
                    </label>
                    <p className="text-sm text-muted-foreground">
                      {(() => {
                        const phone = extractFromDescription(
                          existingResponse?.description || "",
                          "Contact Phone",
                        );
                        if (!phone) return "Not specified";
                        const tel = phone.replace(/[^0-9+]/g, "");
                        return (
                          <a className="text-blue-600 underline" href={`tel:${tel}`}>
                            {phone}
                          </a>
                        );
                      })()}
                    </p>
                  </div>

                  <div>
                    <label className="text-sm font-medium flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Payment Terms
                    </label>
                    <p className="text-sm text-muted-foreground">
                      {extractFromDescription(
                        existingResponse?.description || "",
                        "Payment Terms",
                      ) || "Not specified"}
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Admin Status</label>
                    <div className="mt-1">
                      <Badge
                        variant={
                          quotation?.admin_status === "accepted"
                            ? "default"
                            : quotation?.admin_status === "rejected"
                              ? "destructive"
                              : "secondary"
                        }
                        className="text-sm px-3 py-1"
                      >
                        {quotation?.admin_status
                          ? quotation.admin_status.charAt(0).toUpperCase() +
                            quotation.admin_status.slice(1)
                          : "Unknown"}
                      </Badge>
                    </div>
                    {quotation?.admin_status === "accepted" && (
                      <p className="text-sm text-green-600 mt-2">
                        ✅ Your quotation has been accepted!
                      </p>
                    )}
                    {quotation?.admin_status === "rejected" && (
                      <p className="text-sm text-red-600 mt-2">
                        ❌ Your quotation was not selected.
                      </p>
                    )}
                    {quotation?.admin_status === "pending" && (
                      <p className="text-sm text-blue-600 mt-2">
                        ⏳ Your quotation is under review.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="text-sm font-medium">Submitted On</label>
                    <p className="text-sm text-muted-foreground">
                      {existingResponse?.submitted_at
                        ? new Date(existingResponse.submitted_at).toLocaleDateString() +
                          " at " +
                          new Date(existingResponse.submitted_at).toLocaleTimeString()
                        : "Unknown"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <label className="text-sm font-medium">Product/Service Description</label>
                <div className="bg-gray-50 p-4 rounded-lg mt-2">
                  <p className="text-sm whitespace-pre-line">
                    {existingResponse?.description?.split("\n\n")[0] || "No description available"}
                  </p>
                </div>
              </div>

              {existingResponse?.description?.split("\n\n")[4] && (
                <div className="mt-4">
                  <label className="text-sm font-medium">Additional Notes</label>
                  <div className="bg-blue-50 p-4 rounded-lg mt-2">
                    <p className="text-sm whitespace-pre-line">
                      {existingResponse.description
                        .split("\n\n")[4]
                        .replace("Additional Notes: ", "")}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : primaryRole === "viewer" ? (
            /* Viewer read-only view when no response submitted */
            <div className="border-t pt-6">
              <h3 className="font-semibold text-lg mb-4">Quotation Response</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Product</label>
                  <p className="text-sm text-muted-foreground">
                    {quotation.product_name} • {quotation.quantity}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Company</label>
                  <p className="text-sm text-muted-foreground">
                    {quotation.company_email || "N/A"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Last Reply Date</label>
                  <p className="text-sm text-muted-foreground">
                    {quotation.last_reply_date
                      ? new Date(quotation.last_reply_date).toLocaleString()
                      : "N/A"}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Status</label>
                  <p className="text-sm text-muted-foreground">{quotation.status || "Unknown"}</p>
                </div>
              </div>

              <div className="mt-6">
                {existingResponse ? (
                  <>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium">Total Amount</label>
                        <p className="text-lg font-semibold">₹{existingResponse.total_amount}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium">Submitted</label>
                        <p className="text-sm text-muted-foreground">
                          {existingResponse.submitted_at
                            ? new Date(existingResponse.submitted_at).toLocaleString()
                            : "N/A"}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium">Response Details</label>
                        <div className="bg-gray-50 p-3 rounded mt-1">
                          <p className="text-sm whitespace-pre-line">
                            {existingResponse.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    No response available yet for this quotation.
                  </div>
                )}
              </div>
            </div>
          ) : !isExpired ? (
            /* Response Form Section */
            <div className="border-t pt-6">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                Your Quotation Details
              </h3>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          Product/Service Description *
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Provide detailed description of your product/service, specifications, quality standards, and any relevant information..."
                            className="min-h-[120px]"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Include product specifications, quality standards, and any special
                          features
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="totalAmount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            Total Amount (INR) *
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="text"
                              placeholder="0.00"
                              {...field}
                              onChange={(e) => {
                                // Allow only numbers and decimal point
                                const value = e.target.value.replace(/[^0-9.]/g, "");
                                // Ensure only one decimal point
                                const parts = value.split(".");
                                if (parts.length > 2) {
                                  field.onChange(parts[0] + "." + parts.slice(1).join(""));
                                } else {
                                  field.onChange(value);
                                }
                              }}
                            />
                          </FormControl>
                          <FormDescription>
                            Enter the total cost including all fees and taxes in Indian Rupees
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="deliveryTime"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Truck className="h-4 w-4" />
                            Delivery Time *
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., 2-3 weeks, 10 business days" {...field} />
                          </FormControl>
                          <FormDescription>
                            Expected delivery time after order confirmation
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="quotationValidity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            Quotation Validity Date *
                          </FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormDescription>
                            Date until which this quotation is valid.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <FormField
                      control={form.control}
                      name="contactPerson"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <User className="h-4 w-4" />
                            Contact Person *
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="Full name and position" {...field} />
                          </FormControl>
                          <FormDescription>
                            Person to contact for follow-up discussions
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="contactPhone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Phone className="h-4 w-4" />
                            Contact Phone *
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., +91 98765 43210" {...field} />
                          </FormControl>
                          <FormDescription>
                            Primary contact number for follow-up (include country code)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="paymentTerms"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4" />
                            Payment Terms *
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., 50% upfront, 50% on delivery" {...field} />
                          </FormControl>
                          <FormDescription>Payment schedule and conditions</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="additionalNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Additional Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Any additional information, terms, conditions, or special requirements..."
                            className="min-h-[80px]"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Warranty information, return policy, or other relevant details
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="termsAccepted"
                    render={({ field }) => (
                      <FormItem className="flex items-start gap-2">
                        <div className="flex items-center">
                          <FormControl>
                            <Checkbox
                              checked={!!field.value}
                              onCheckedChange={(v) => field.onChange(!!v)}
                            />
                          </FormControl>
                        </div>
                        <div className="text-sm">
                          <FormLabel className="font-medium">
                            I accept the Terms & Conditions *
                          </FormLabel>
                          <div className="text-muted-foreground">
                            <Dialog>
                              <DialogTrigger asChild>
                                <button type="button" className="text-blue-600 underline ml-2">
                                  Read Terms & Conditions
                                </button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Terms & Conditions</DialogTitle>
                                  <DialogDescription>
                                    Please read the supplier terms and conditions. By checking the
                                    box you accept these terms.
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="mt-4 text-sm">
                                  <p>
                                    By submitting this quotation response you agree to the terms
                                    provided. (Provide full T&C text here.)
                                  </p>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                          <FormMessage />
                        </div>
                      </FormItem>
                    )}
                  />

                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-sm text-blue-800">
                      <strong>Important:</strong> By submitting this quotation, you agree to honor
                      the quoted price and terms for 30 days from the response deadline, unless
                      otherwise agreed upon.
                    </p>
                  </div>

                  <Button
                    type="submit"
                    disabled={isSubmitting || !form.watch("termsAccepted")}
                    size="lg"
                    className="w-full"
                  >
                    {isSubmitting ? "Submitting Response..." : "Submit Quotation Response"}
                  </Button>
                </form>
              </Form>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
