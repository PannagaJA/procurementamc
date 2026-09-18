import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { supabase } from '../integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { User } from '@supabase/supabase-js';
import { useAuth } from '@/lib/auth';
import { ticketPriorityOptions } from '@/lib/ticketUtils';
import Layout from '@/components/Layout';


const ProcureRequest = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    contactNumber: '',
    department: '',
    deviceName: '',
    deviceSpecifications: '',
    quantity: '',
    estimatedCost: '',
    justification: '',
    priority: 'medium',
  });
  const [departments, setDepartments] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const { primaryRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const getUserInfo = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();

      if (error || !user) {
        toast({
          title: "Error",
          description: "Please log in to raise a procure request",
          variant: "destructive",
        });
        navigate({ to: '/auth' });
        return;
      }

      // Fetch user profile to get name
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single();

      if (profile) {
        setFormData(prev => ({
          ...prev,
          name: profile.full_name || '',
          email: profile.email || ''
        }));
      }

      // load user's roles to find HOD department
      try {
        const { data: roles } = await supabase
          .from('user_roles')
          .select('role, department_id')
          .eq('user_id', user.id);

        const hodRole = (roles || []).find((r: any) => r.role === 'hod');
        if (hodRole && hodRole.department_id) {
          setFormData(prev => ({ ...prev, department: hodRole.department_id || '' }));
        }
      } catch (e) {
        // ignore role lookup errors
        console.error('Failed to load user roles for department default', e);
      }

      setUser(user);
      setLoading(false);
    };

    const fetchDepartments = async () => {
      try {
        const { data, error } = await supabase.from('departments').select('*').order('name');
        if (error) throw error;
        setDepartments(data || []);
      } catch (e) {
        console.error('Failed to load departments', e);
      }
    };

    getUserInfo();
    fetchDepartments();
  }, [navigate, toast]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | { name: string; value: string }) => {
    if ('target' in e) {
      const { name, value } = e.target;
      setFormData(prev => ({ ...prev, [name]: value }));
    } else {
      const { name, value } = e;
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Ensure user is authenticated
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Create issue description
      const issueDescription = `
Device Name: ${formData.deviceName}
Specifications: ${formData.deviceSpecifications}
Quantity: ${formData.quantity}
Estimated Cost: ${formData.estimatedCost}
Justification: ${formData.justification}
      `.trim();

      // Generate ticket number first
      const { data: ticketData, error: ticketError } = await supabase
        .rpc('generate_ticket_number');

      if (ticketError) throw ticketError;

      const ticketNumber = ticketData;

      // Insert ticket into database with explicit ticket number
      const insertPayload: any = {
        ticket_number: ticketNumber,
        name: formData.name,
        email: formData.email,
        contact_number: formData.contactNumber,
        department: formData.department,
        issue_category: 'procure',
        issue_description: issueDescription,
        priority: formData.priority,
        created_by: user.id
      };

      // If HOD, send to Principal for approval
      if (primaryRole === 'hod') {
        insertPayload.status = 'pending_principal';
      } else {
        insertPayload.status = 'pending';
      }

      const { data, error } = await supabase
        .from('tickets')
        .insert([insertPayload])
        .select('ticket_number')
        .single();

      if (error) throw error;

      toast({
        title: primaryRole === 'hod' ? 'Request Sent' : 'Procure request submitted',
        description: primaryRole === 'hod' ? `Your request ${data.ticket_number} was sent to Principal for approval` : `Your request has been submitted with ticket number ${data.ticket_number}`,
      });

      // Reset form
      setFormData({
        name: formData.name, // Keep user info
        email: formData.email,
        contactNumber: '',
        department: '',
        deviceName: '',
        deviceSpecifications: '',
        quantity: '',
        estimatedCost: '',
        justification: '',
        priority: 'medium'
      });

      navigate({ to: '/my-tickets' });
    } catch (error: any) {
      console.error('Error submitting procure request:', error);
      toast({
        title: "Submission failed",
        description: error.message || "Failed to submit procure request",
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
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-gray-900"></div>
            <p className="mt-4">Loading...</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Procure Request</CardTitle>
            <CardDescription>
              Request procurement of new devices or equipment. Please provide all required details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    disabled
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    required
                    disabled
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="contactNumber">Contact Number</Label>
                  <Input
                    id="contactNumber"
                    name="contactNumber"
                    value={formData.contactNumber}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <Label htmlFor="department">Department *</Label>
                  <Select value={formData.department} onValueChange={(value) => handleChange({ name: 'department', value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="deviceName">Device/Equipment Name *</Label>
                <Input
                  id="deviceName"
                  name="deviceName"
                  value={formData.deviceName}
                  onChange={handleChange}
                  placeholder="e.g., Laptop, Printer, Software License"
                  required
                />
              </div>

              <div>
                <Label htmlFor="deviceSpecifications">Device Specifications *</Label>
                <Textarea
                  id="deviceSpecifications"
                  name="deviceSpecifications"
                  value={formData.deviceSpecifications}
                  onChange={handleChange}
                  placeholder="Detailed specifications, model number, requirements, etc."
                  rows={3}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input
                    id="quantity"
                    name="quantity"
                    type="number"
                    min="1"
                    value={formData.quantity}
                    onChange={handleChange}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="estimatedCost">Estimated Cost (₹)</Label>
                  <Input
                    id="estimatedCost"
                    name="estimatedCost"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.estimatedCost}
                    onChange={handleChange}
                    placeholder="Approximate cost per unit"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="justification">Justification *</Label>
                <Textarea
                  id="justification"
                  name="justification"
                  value={formData.justification}
                  onChange={handleChange}
                  placeholder="Why do you need this device? How will it be used?"
                  rows={3}
                  required
                />
              </div>

              <div>
                <Label htmlFor="priority">Priority *</Label>
                <Select value={formData.priority} onValueChange={(value) => handleChange({ name: 'priority', value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ticketPriorityOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* approval letter upload removed per UX change */}

              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? 'Submitting...' : (primaryRole === 'hod' ? 'Request Principal Approval' : 'Submit Procure Request')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default ProcureRequest;