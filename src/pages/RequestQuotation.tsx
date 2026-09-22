import { useState, useMemo } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Combobox } from "@/components/ui/combobox"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { useToast } from "@/hooks/use-toast"
import { supabase } from "@/integrations/supabase/client"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import Layout from "@/components/Layout"

const quotationSchema = z.object({
  categoryId: z.string().min(1, "Category is required"),
  description: z.string().min(1, "Description is required"),
  productName: z.string().min(1, "Product name is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  lastReplyDate: z.string().min(1, "Last reply date is required"),
  companyEmails: z.array(z.string().email()).min(1, "At least one company email is required"),
})

type QuotationForm = z.infer<typeof quotationSchema>

export default function RequestQuotation() {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()

  const { data: quotations } = useQuery({
    queryKey: ['quotations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotations')
        .select(`
          *,
          categories (name),
          quotation_responses (
            description,
            total_amount,
            submitted_at
          )
        `)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    }
  })

  const queryClient = useQueryClient()

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: string }) => {
      const { error } = await supabase
        .from('quotations')
        .update({ admin_status: status })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quotations'] })
      toast({ title: "Status updated successfully" })
    },
    onError: () => {
      toast({ title: "Failed to update status", variant: "destructive" })
    }
  })

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name')
      if (error) throw error
      return data
    }
  })

  const groupedQuotations = useMemo(() => {
    if (!quotations) return {}
    return quotations.reduce((acc, q) => {
      const catId = q.category_id || 'uncategorized'
      if (!acc[catId]) {
        acc[catId] = { category: q.categories, quotations: [] }
      }
      acc[catId].quotations.push(q)
      return acc
    }, {} as Record<string, { category: any, quotations: any[] }>)
  }, [quotations])

  const form = useForm<QuotationForm>({
    resolver: zodResolver(quotationSchema),
    defaultValues: {
      categoryId: "",
      description: "",
      productName: "",
      quantity: 1,
      lastReplyDate: "",
      companyEmails: [""],
    },
  })

  const onSubmit = async (data: QuotationForm) => {
    setIsSubmitting(true)
    try {
      // Create quotations for each company
      const quotationPromises = data.companyEmails.map(async (email) => {
        const { data: quotation, error } = await supabase
          .from('quotations')
          .insert({
            category_id: data.categoryId,
            company_email: email,
            description: data.description,
            product_name: data.productName,
            quantity: data.quantity,
            last_reply_date: data.lastReplyDate,
          })
          .select()
          .single()

        if (error) throw error
        return quotation
      })

      const quotations = await Promise.all(quotationPromises)

      // Send emails using the edge function
      console.log('Sending emails for quotations:', quotations.map(q => q.id))

      // Get category name for the email
      const selectedCategory = categories?.find(cat => cat.id === data.categoryId)

      // Call edge function to send emails
      const emailPromises = quotations.map(async (quotation) => {
        const { error } = await supabase.functions.invoke("send-quotation-email", {
          body: {
            quotationId: quotation.id,
            companyEmails: [quotation.company_email], // Send to this specific company
            quotationData: {
              productName: data.productName,
              categoryName: selectedCategory?.name || 'Unknown Category',
              description: data.description,
              quantity: data.quantity,
              lastReplyDate: data.lastReplyDate,
            }
          },
        })

        if (error) {
          console.error(`Failed to send email for quotation ${quotation.id}:`, error)
          throw error
        }

        return quotation
      })

      await Promise.all(emailPromises)

      toast({
        title: "Success",
        description: "Quotation requests sent successfully to all companies",
      })

      form.reset()
    } catch (error) {
      console.error('Error:', error)
      toast({
        title: "Error",
        description: "Failed to send quotation requests",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const addEmail = () => {
    const currentEmails = form.getValues('companyEmails')
    form.setValue('companyEmails', [...currentEmails, ""])
  }

  const removeEmail = (index: number) => {
    const currentEmails = form.getValues('companyEmails')
    if (currentEmails.length > 1) {
      form.setValue('companyEmails', currentEmails.filter((_, i) => i !== index))
    }
  }

  return (
    <Layout>
      <div className="container mx-auto py-8">
        <Tabs defaultValue="request" className="w-full space-y-4">
          <div className="w-full overflow-x-auto pb-1 scrollbar-none">
            <TabsList className="inline-flex w-auto min-w-full sm:min-w-0 sm:grid sm:grid-cols-2 h-auto p-1.5 gap-1.5 bg-slate-200/70 dark:bg-slate-800/80 rounded-xl">
              <TabsTrigger value="request" className="font-semibold text-xs sm:text-sm py-2 px-4 whitespace-nowrap rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm">Request Quotation</TabsTrigger>
              <TabsTrigger value="view" className="font-semibold text-xs sm:text-sm py-2 px-4 whitespace-nowrap rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-sm">View Quotations</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="request">
            <Card>
              <CardHeader>
                <CardTitle>Request Quotation</CardTitle>
                <CardDescription>
                  Send quotation requests to companies for specific product categories
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                      control={form.control}
                      name="categoryId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Product Category</FormLabel>
                          <FormControl>
                            <Combobox
                              options={categories?.map((category) => ({
                                value: category.id,
                                label: category.name,
                              })) || []}
                              value={field.value}
                              onValueChange={field.onChange}
                              placeholder="Select a category"
                              searchPlaceholder="Search categories..."
                              emptyText="No categories found."
                              className="w-full"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="productName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Product Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter product name" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Product Description</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Enter quotation description"
                              className="min-h-[100px]"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="quantity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Product Quantity</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="lastReplyDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Date to Reply by the Vendor</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div>
                      <FormLabel>Vendor Company mail</FormLabel>
                      {form.watch('companyEmails').map((_, index) => (
                        <div key={index} className="flex gap-2 mt-2">
                          <FormField
                            control={form.control}
                            name={`companyEmails.${index}`}
                            render={({ field }) => (
                              <FormItem className="flex-1">
                                <FormControl>
                                  <Input
                                    type="email"
                                    placeholder="vendor@example.com"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          {form.watch('companyEmails').length > 1 && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => removeEmail(index)}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addEmail}
                        className="mt-2"
                      >
                        Add Email
                      </Button>
                    </div>

                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting ? "Sending..." : "Send Quotation Requests"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="view">
            <Card>
              <CardHeader>
                <CardTitle>View Quotations</CardTitle>
                <CardDescription>
                  View sent quotation requests grouped by category
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {Object.entries(groupedQuotations as Record<string, { category: any; quotations: any[] }>).map(([catId, { category, quotations: catQuotations }]) => (
                    <AccordionItem key={catId} value={catId}>
                      <AccordionTrigger>
                        {category?.name || 'Unknown Category'} ({catQuotations.length} quotations)
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-4">
                          {catQuotations.map((quotation) => (
                            <Card key={quotation.id}>
                              <CardContent className="pt-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <div>
                                    <h4 className="font-semibold">{quotation.product_name}</h4>
                                    <p className="text-sm text-muted-foreground">{quotation.description}</p>
                                    <p>Quantity: {quotation.quantity}</p>
                                    <p>Company: {quotation.company_email}</p>
                                    <p>Last Reply Date: {quotation.last_reply_date}</p>
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span>Status:</span>
                                      <Badge variant={quotation.status === 'responded' ? 'default' : quotation.status === 'expired' ? 'destructive' : 'secondary'}>
                                        {quotation.status ? (quotation.status.charAt(0).toUpperCase() + quotation.status.slice(1)) : 'Unknown'}
                                      </Badge>
                                    </div>
                                    {quotation.quotation_responses && quotation.quotation_responses.length > 0 && (
                                      <div className="mt-2">
                                        <h5 className="font-medium">Response Details:</h5>
                                        <div className="text-sm space-y-1">
                                          <p><strong>Total Amount:</strong> ₹{quotation.quotation_responses[0].total_amount}</p>
                                          <p><strong>Submitted:</strong> {new Date(quotation.quotation_responses[0].submitted_at).toLocaleDateString()}</p>
                                          {quotation.quotation_responses[0].description && (
                                            <div className="mt-2">
                                              <h5 className="font-medium">Response Details</h5>
                                              <div className="mt-2 p-3 bg-gray-50 rounded border text-sm whitespace-pre-line max-h-60 overflow-y-auto">
                                                <div className="space-y-2">
                                                  {quotation.quotation_responses[0].description.split('\n\n').map((section: string, index: number) => {
                                                    if (section.startsWith('Delivery Time:')) {
                                                      return <p key={index}><strong>Delivery Time:</strong> {section.replace('Delivery Time: ', '')}</p>
                                                    } else if (section.startsWith('Contact Person:')) {
                                                      return <p key={index}><strong>Contact Person:</strong> {section.replace('Contact Person: ', '')}</p>
                                                    } else if (section.startsWith('Payment Terms:')) {
                                                      return <p key={index}><strong>Payment Terms:</strong> {section.replace('Payment Terms: ', '')}</p>
                                                    } else if (section.startsWith('Additional Notes:')) {
                                                      return <p key={index}><strong>Additional Notes:</strong> {section.replace('Additional Notes: ', '')}</p>
                                                    } else {
                                                      return <p key={index}><strong>Description:</strong> {section}</p>
                                                    }
                                                  })}
                                                </div>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                    <div className="flex items-center gap-2 mt-2">
                                      <span>Admin Status:</span>
                                      <Badge variant={quotation.admin_status === 'accepted' ? 'default' : quotation.admin_status === 'rejected' ? 'destructive' : 'secondary'}>
                                        {quotation.admin_status ? (quotation.admin_status.charAt(0).toUpperCase() + quotation.admin_status.slice(1)) : 'Pending'}
                                      </Badge>
                                    </div>
                                    {quotation.admin_status === 'pending' && quotation.status === 'responded' && (
                                      <div className="flex gap-2 mt-2">
                                        <Button size="sm" onClick={() => updateStatusMutation.mutate({ id: quotation.id, status: 'accepted' })}>
                                          Accept
                                        </Button>
                                        <Button size="sm" variant="outline" onClick={() => updateStatusMutation.mutate({ id: quotation.id, status: 'rejected' })}>
                                          Reject
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  )
}