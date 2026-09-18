import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { supabase } from '../integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { CalendarIcon, MessageSquareIcon, SearchIcon, FileTextIcon, DownloadIcon } from 'lucide-react';
import Layout from '@/components/Layout';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';
import { usePagination } from '@/hooks/use-pagination';
import { PaginationControls } from '@/components/PaginationControls';
import { createPaginatedQuery } from '@/lib/utils';

interface Ticket {
  id: string;
  ticket_number: string | null;
  name: string | null;
  email: string | null;
  contact_number: string | null;
  phone?: string | null;
  attachment_url?: string | null;
  department: string | null;
  issue_category: string | null;
  issue_description: string | null;
  priority: 'low' | 'medium' | 'high' | string;
  // added service-approved/service-rejected
  status: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  // computed SLA fields (not stored in DB)
  sla?: {
    respondByISO?: string;
    respondByDisplay?: string;
    respondDaysOver?: number;
    resolveByISO?: string;
    resolveByDisplay?: string;
    resolveDaysOver?: number;
  };
}

interface TicketUpdate {
  id: string;
  ticket_id: string;
  status_from: string | null;
  status_to: string | null;
  admin_notes: string | null;
  created_at: string;
  updated_by: string | null;
}

const AdminTicketDashboard = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isPrinciple, setIsPrinciple] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [viewTicket, setViewTicket] = useState<Ticket | null>(null);
  const [updateForm, setUpdateForm] = useState({
    status_to: '',
    admin_notes: ''
  });
  const [filters, setFilters] = useState({
    status: 'all',
    priority: 'all',
    department: '',
    search: '',
    category: 'all'
  });
  const [reportDateRange, setReportDateRange] = useState<number>(1);
  // reportDateRange represents number of months for the report window
  const [showReports, setShowReports] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [emailForm, setEmailForm] = useState({ to: '', subject: 'Ticket Report', body: 'Please find the attached ticket report.' });
  const [showFiltersLocal, setShowFiltersLocal] = useState(true);
  
  const { toast } = useToast();
  const navigate = useNavigate();

  const {
    pagination,
    setPage,
    setPageSize,
    setTotal,
    resetPagination,
  } = usePagination(10, 1);

  // Stats state
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    inProgress: 0,
    waitingForUser: 0,
    resolved: 0,
  });

  const fetchStats = useCallback(async () => {
    try {
      const { data: allTickets, error } = await supabase
        .from('tickets')
        .select('status');

      if (error) throw error;

      const total = allTickets?.length || 0;
      const pending = allTickets?.filter(t => t.status === 'pending').length || 0;
      const inProgress = allTickets?.filter(t => t.status === 'in-progress').length || 0;
      const waitingForUser = allTickets?.filter(t => t.status === 'waiting-for-user').length || 0;
      const resolved = allTickets?.filter(t => t.status === 'resolved' || t.status === 'completed').length || 0;

      setStats({
        total,
        pending,
        inProgress,
        waitingForUser,
        resolved,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, []);
  // Function to format procure ticket description
  const formatProcureDescription = (description: string) => {
    const lines = description.split('\n').filter(line => line.trim());
    const data: { [key: string]: string } = {};
    
    lines.forEach(line => {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        data[key] = value;
      }
    });
    
    return data;
  };

  // Function to render ticket description
  const renderTicketDescription = (ticket: Ticket) => {
    if (ticket.issue_category === 'procure') {
      const procureData = formatProcureDescription(ticket.issue_description || '');
      return (
        <div className="space-y-1 text-sm">
          <div><strong>Device:</strong> {procureData['Device Name']}</div>
          <div><strong>Quantity:</strong> {procureData['Quantity']}</div>
          <div><strong>Specifications:</strong> {procureData['Specifications']}</div>
          <div><strong>Estimated Cost:</strong> ₹{procureData['Estimated Cost']}</div>
          <div><strong>Justification:</strong> {procureData['Justification']}</div>
          {procureData['Approval Letter'] && (
            <div><strong>Approval Letter:</strong> <a href={procureData['Approval Letter']} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a></div>
          )}
        </div>
      );
    }
    return ticket.issue_description;
  };

  const fetchAllTickets = useCallback(async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        toast({
          title: "Error",
          description: "Please log in to access this page",
          variant: "destructive",
        });
        navigate({ to: '/auth' });
        return;
      }

      // Role checking is already done in checkUserRoles function
      // If user reaches here, they have either admin or principle role

      let query = supabase
        .from('tickets')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      // By default, Admin should not see tickets awaiting Principal approval
      if (filters.status === 'all') {
        // By default hide tickets awaiting Principal approval and those rejected by Principal
        query = query.neq('status', 'pending_principal').neq('status', 'procure-rejected').neq('status', 'service-rejected');
      }

      // Apply filters
      console.debug('fetchAllTickets: applying filters', filters, 'page', pagination.page, 'pageSize', pagination.pageSize);
      if (filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }
      if (filters.priority !== 'all') {
        query = query.eq('priority', filters.priority);
      }
      if (filters.department && String(filters.department).trim() !== '') {
        query = query.ilike('department', `%${String(filters.department).trim()}%`);
      }
      const searchTerm = String(filters.search || '').trim();
      if (searchTerm !== '') {
        const esc = searchTerm.replace(/%/g, '\\%').replace(/,/g, '');
        query = query.or(`ticket_number.ilike.%${esc}%,name.ilike.%${esc}%,email.ilike.%${esc}%,issue_description.ilike.%${esc}%`);
      }
      if (filters.category !== 'all') {
        query = query.eq('issue_category', filters.category);
      }

      // Apply pagination
      query = createPaginatedQuery(query, pagination.page, pagination.pageSize);

      const { data, error, count } = await query;

      if (error) throw error;

      // compute SLA fields for each ticket before setting state
      const withSLA = (data || []).map((t: Ticket) => computeSLAForTicket(t));
      setTickets(withSLA);
      setTotal(count || 0);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to load tickets. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast, navigate, filters, pagination.page, pagination.pageSize]);

  const handleFilterChange = (field: string, value: string) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
    resetPagination(); // Reset to first page when filters change
  };

  const generateReport = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Not authenticated");

      // Calculate date range (reportDateRange is months)
      const endDate = new Date();
      const startDate = new Date();
      const months = Number(reportDateRange) || 1;
      if (Number.isNaN(months) || months <= 0) {
        console.warn('Invalid reportDateRange, defaulting to 1 month', reportDateRange);
      }
      startDate.setMonth(startDate.getMonth() - (Number.isNaN(months) ? 1 : months));

      // Fetch tickets within date range
      const { data: tickets, error } = await supabase
        .from('tickets')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Calculate metrics
      const totalTickets = tickets.length;
      const resolvedTickets = tickets.filter(t => t.status === 'resolved' || t.status === 'completed');
      const avgResolutionTime = resolvedTickets.length > 0 
        ? resolvedTickets.reduce((acc, ticket) => {
            const created = new Date(ticket.created_at);
            const resolved = new Date(ticket.updated_at);
            return acc + (resolved.getTime() - created.getTime());
          }, 0) / resolvedTickets.length / (1000 * 60 * 60) // Convert to hours
        : 0;

      const statusBreakdown = tickets.reduce((acc, ticket) => {
        acc[ticket.status] = (acc[ticket.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const categoryBreakdown = tickets.reduce((acc, ticket) => {
        const cat = (ticket as any).category || ticket.issue_category || 'general';
        acc[cat] = (acc[cat] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Generate PDF
      const doc = new jsPDF();
      
      // Title
      doc.setFontSize(20);
      doc.text('Ticket Resolution Report', 20, 30);
      
      // Date range
      doc.setFontSize(12);
      doc.text(`Report Period: ${format(startDate, 'MMM dd, yyyy')} - ${format(endDate, 'MMM dd, yyyy')}`, 20, 45);
      doc.text(`Generated on: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 20, 55);

      // Summary metrics
      doc.setFontSize(14);
      doc.text('Summary Metrics', 20, 75);
      
      doc.setFontSize(10);
      doc.text(`Total Tickets: ${totalTickets}`, 20, 85);
      doc.text(`Resolved Tickets: ${resolvedTickets.length}`, 20, 95);
      doc.text(`Resolution Rate: ${totalTickets > 0 ? ((resolvedTickets.length / totalTickets) * 100).toFixed(1) : 0}%`, 20, 105);
      doc.text(`Average Resolution Time: ${avgResolutionTime.toFixed(1)} hours`, 20, 115);

      // Status breakdown
      doc.setFontSize(14);
      doc.text('Status Breakdown', 20, 135);
      
      let yPos = 145;
      doc.setFontSize(10);
      Object.entries(statusBreakdown).forEach(([status, count]) => {
        doc.text(`${status.charAt(0).toUpperCase() + status.slice(1)}: ${count} (${(((count as number) / totalTickets) * 100).toFixed(1)}%)`, 20, yPos);
        yPos += 10;
      });

      // Category breakdown
      if (yPos > 250) {
        doc.addPage();
        yPos = 30;
      }
      
      doc.setFontSize(14);
      doc.text('Category Breakdown', 20, yPos + 10);
      
      yPos += 20;
      doc.setFontSize(10);
      Object.entries(categoryBreakdown).forEach(([category, count]) => {
        doc.text(`${category}: ${count}`, 20, yPos);
        yPos += 10;
      });

      // Save PDF to user's machine
      doc.save(`ticket-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`);

      toast({
        title: "Success",
        description: "Report generated and downloaded successfully",
      });

    } catch (error) {
      console.error('Error generating report:', error);
      toast({
        title: "Error",
        description: "Failed to generate report",
        variant: "destructive",
      });
    }
  };

  // Create PDF and return base64 string (used for emailing)
  const createReportPdfBase64 = async () => {
    // replicate PDF creation logic but return base64
    const endDate = new Date();
    const startDate = new Date();
    const months = Number(reportDateRange) || 1;
    startDate.setMonth(startDate.getMonth() - months);

    const { data: ticketsData } = await supabase
      .from('tickets')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: false });

    const ticketsList = (ticketsData || []).map((t: Ticket) => computeSLAForTicket(t));

    const totalTickets = ticketsList.length;
    const resolvedTickets = ticketsList.filter((t: any) => t.status === 'resolved' || t.status === 'completed');
    const avgResolutionTime = resolvedTickets.length > 0 
      ? resolvedTickets.reduce((acc: number, ticket: any) => {
          const created = new Date(ticket.created_at);
          const resolved = new Date(ticket.updated_at);
          return acc + (resolved.getTime() - created.getTime());
        }, 0) / resolvedTickets.length / (1000 * 60 * 60)
      : 0;

    const statusBreakdown = ticketsList.reduce((acc: any, ticket: any) => {
      acc[ticket.status] = (acc[ticket.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const categoryBreakdown = ticketsList.reduce((acc: any, ticket: any) => {
      acc[ticket.issue_category] = (acc[ticket.issue_category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text('Ticket Resolution Report', 20, 30);
    doc.setFontSize(12);
    doc.text(`Report Period: ${format(startDate, 'MMM dd, yyyy')} - ${format(endDate, 'MMM dd, yyyy')}`, 20, 45);
    doc.text(`Generated on: ${format(new Date(), 'yyyy-MM-dd HH:mm')}`, 20, 55);
    doc.setFontSize(14);
    doc.text('Summary Metrics', 20, 75);
    doc.setFontSize(10);
    doc.text(`Total Tickets: ${totalTickets}`, 20, 85);
    doc.text(`Resolved Tickets: ${resolvedTickets.length}`, 20, 95);
    doc.text(`Resolution Rate: ${totalTickets > 0 ? ((resolvedTickets.length / totalTickets) * 100).toFixed(1) : 0}%`, 20, 105);
    doc.text(`Average Resolution Time: ${avgResolutionTime.toFixed(1)} hours`, 20, 115);
    doc.setFontSize(14);
    doc.text('Status Breakdown', 20, 135);
    let yPos = 145;
    doc.setFontSize(10);
    Object.entries(statusBreakdown).forEach(([status, count]) => {
      doc.text(`${status.charAt(0).toUpperCase() + status.slice(1)}: ${count} (${(((count as number) / Math.max(1, totalTickets)) * 100).toFixed(1)}%)`, 20, yPos);
      yPos += 10;
    });
    if (yPos > 250) { doc.addPage(); yPos = 30; }
    doc.setFontSize(14);
    doc.text('Category Breakdown', 20, yPos + 10);
    yPos += 20;
    doc.setFontSize(10);
    Object.entries(categoryBreakdown).forEach(([category, count]) => {
      doc.text(`${category}: ${count}`, 20, yPos);
      yPos += 10;
    });

    // return base64 string
    const arrayBuffer = doc.output('arraybuffer') as ArrayBuffer;
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    try {
      return btoa(binary);
    } catch (e) {
      // Fallback for environments where btoa may not accept large strings
      console.warn('btoa failed, returning empty string', e);
      return '';
    }
  };

  // Create CSV and return base64 string
  const createReportCsvBase64 = async () => {
    const endDate = new Date();
    const startDate = new Date();
    const months = Number(reportDateRange) || 1;
    startDate.setMonth(startDate.getMonth() - months);

    const { data: ticketsData } = await supabase
      .from('tickets')
      .select('*')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString())
      .order('created_at', { ascending: false });

    const rows = (ticketsData || []).map((t: any) => ({
      ticket_number: t.ticket_number,
      name: t.name,
      email: t.email,
      department: t.department || '',
      issue_category: t.issue_category,
      priority: t.priority,
      status: t.status,
      created_at: t.created_at,
    }));

    const headers = ['ticket_number','name','email','department','issue_category','priority','status','created_at'];
    const csvLines = [headers.join(',')];
    for (const r of rows) {
      const line = headers.map(h => `"${String((r as any)[h] ?? '').replace(/"/g, '""')}"`).join(',');
      csvLines.push(line);
    }
    const csv = csvLines.join('\n');

    // base64 encode safely for UTF-8
    let base64 = '';
    try {
      if (typeof window !== 'undefined' && window.btoa) {
        base64 = window.btoa(unescape(encodeURIComponent(csv)));
      } else if (typeof Buffer !== 'undefined') {
        base64 = Buffer.from(csv).toString('base64');
      } else {
        base64 = btoa(csv);
      }
    } catch (e) {
      console.warn('CSV base64 encode failed, falling back to simple btoa', e);
      base64 = btoa(csv);
    }

    return base64;
  };

  const sendReportByEmail = async (to: string, subject: string, body: string) => {
    try {
      if (!to || !/^[\w-.]+@([\w-]+\.)+[\w-]{2,}$/.test(to)) {
        toast({ title: 'Validation', description: 'Please provide a valid recipient email', variant: 'destructive' });
        return;
      }

      toast({ title: 'Sending', description: `Sending report to ${to}...` });

      // Generate CSV and send as attachment (edge function expects base64 in pdfBase64 field)
      const csvBase64 = await createReportCsvBase64();
      if (!csvBase64) throw new Error('Failed to generate CSV attachment');

      const payload = {
        to,
        subject,
        body,
        filename: `ticket-report-${format(new Date(), 'yyyy-MM-dd')}.csv`,
        pdfBase64: csvBase64,
      };

      // Try using Supabase Functions client first
      const invokeRes = await supabase.functions.invoke('send-ticket-report-email', { body: payload });
      if (invokeRes.error) {
        console.warn('supabase.functions.invoke returned error', invokeRes.error);
        // Attempt a fetch fallback but capture server response for debugging
        const fbUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-ticket-report-email`;
        const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const fetchRes = await fetch(fbUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': String(apiKey),
            'Authorization': `Bearer ${String(apiKey)}`,
          },
          body: JSON.stringify(payload),
        });
        const text = await fetchRes.text().catch(() => 'no body');
        if (!fetchRes.ok) {
          throw new Error(`Edge function fetch failed: ${fetchRes.status} ${fetchRes.statusText} - ${text}`);
        }
      }

      toast({ title: 'Success', description: `Email sent to ${to}` });
      setShowEmailDialog(false);
    } catch (err) {
      console.error('Error sending report email', err);
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: 'Error', description: `Failed to send email: ${message}`, variant: 'destructive' });
    }
  };

    const exportCSV = () => {
      try {
        if (!tickets || tickets.length === 0) {
          toast({ title: 'Info', description: 'No tickets to export' });
          return;
        }

        const headers = [
          'ticket_number','name','email','department','issue_category','priority','status','created_at'
        ];
        const rows = tickets.map(t => [
          t.ticket_number,
          t.name,
          t.email,
          t.department || '',
          t.issue_category,
          t.priority,
          t.status,
          t.created_at
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `tickets-${format(new Date(), 'yyyy-MM-dd')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error('Error exporting CSV', err);
        toast({ title: 'Error', description: 'Failed to export CSV', variant: 'destructive' });
      }
    };

  const checkUserRoles = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        navigate({ to: '/auth' });
        return;
      }

      // Check admin role
      const { data: adminData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      setIsAdmin(!!adminData);

      // Check principle role
      const { data: principleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "principle")
        .maybeSingle();

      setIsPrinciple(!!principleData);

      // If neither admin nor principle, redirect
      if (!adminData && !principleData) {
        navigate({ to: '/' });
        return;
      }
    } catch (error) {
      console.error("Error checking user roles:", error);
      navigate({ to: '/' });
    }
  };

  useEffect(() => {
    checkUserRoles();
  }, []);

  useEffect(() => {
    // Only fetch tickets if user has been authenticated and roles checked
    if (isAdmin || isPrinciple) {
      fetchAllTickets();
    }
  }, [pagination.page, pagination.pageSize, filters.status, filters.priority, filters.department, filters.search, filters.category, isAdmin, isPrinciple]);

  useEffect(() => {
    // Only fetch stats if user has been authenticated and roles checked
    if (isAdmin || isPrinciple) {
      fetchStats();
    }
  }, [fetchStats, isAdmin, isPrinciple]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      case 'waiting-for-user':
        return 'bg-orange-100 text-orange-800';
      case 'resolved':
        return 'bg-green-100 text-green-800';
      case 'completed':
        return 'bg-purple-100 text-purple-800';
      case 'procure-approved':
        return 'bg-emerald-100 text-emerald-800';
      case 'procure-rejected':
        return 'bg-red-100 text-red-800';
      case 'service-approved':
        return 'bg-emerald-100 text-emerald-800';
      case 'service-rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low':
        return 'bg-green-100 text-green-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'high':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const SLA_RULES: Record<string, { respondHours: number; resolveHours: number }> = {
    high: { respondHours: 1, resolveHours: 8 },
    medium: { respondHours: 4, resolveHours: 48 },
    low: { respondHours: 24, resolveHours: 168 },
  };

  const fmtDuration = (msDiff: number) => {
    const abs = Math.abs(msDiff);
    const days = Math.floor(abs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((abs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h`;
    const mins = Math.floor((abs % (1000 * 60 * 60)) / (1000 * 60));
    if (mins > 0) return `${mins}m`;
    return '0m';
  };

  const computeSLAForTicket = (ticket: Ticket) => {
    try {
      const now = new Date();

      // If server-side fields exist (from migration), prefer them
      if ((ticket as any).respond_by || (ticket as any).resolve_by) {
        const respondBy = (ticket as any).respond_by ? new Date((ticket as any).respond_by) : undefined;
        const resolveBy = (ticket as any).resolve_by ? new Date((ticket as any).resolve_by) : undefined;

        ticket.sla = {
          respondByISO: respondBy ? respondBy.toISOString() : undefined,
          respondByDisplay: respondBy ? format(respondBy, 'PP p') : undefined,
          respondDaysOver: (ticket as any).respond_days_over ?? (respondBy && now > respondBy ? Math.floor((now.getTime() - respondBy.getTime()) / (1000 * 60 * 60 * 24)) : 0),
          resolveByISO: resolveBy ? resolveBy.toISOString() : undefined,
          resolveByDisplay: resolveBy ? format(resolveBy, 'PP p') : undefined,
          resolveDaysOver: (ticket as any).resolve_days_over ?? (resolveBy && now > resolveBy ? Math.floor((now.getTime() - resolveBy.getTime()) / (1000 * 60 * 60 * 24)) : 0),
        };
        return ticket;
      }

      // Fallback: compute from created_at and priority (client-side)
      const rule = SLA_RULES[ticket.priority] || SLA_RULES['low'];
      const created = new Date(ticket.created_at);
      if (isNaN(created.getTime())) return ticket;

      const respondBy = new Date(created.getTime() + rule.respondHours * 60 * 60 * 1000);
      const resolveBy = new Date(created.getTime() + rule.resolveHours * 60 * 60 * 1000);
      const respondDiff = now.getTime() - respondBy.getTime(); // positive = overdue
      const resolveDiff = now.getTime() - resolveBy.getTime();

      ticket.sla = {
        respondByISO: respondBy.toISOString(),
        respondByDisplay: format(respondBy, 'PP p'),
        respondDaysOver: respondDiff > 0 ? Math.floor(respondDiff / (1000 * 60 * 60 * 24)) : 0,
        resolveByISO: resolveBy.toISOString(),
        resolveByDisplay: format(resolveBy, 'PP p'),
        resolveDaysOver: resolveDiff > 0 ? Math.floor(resolveDiff / (1000 * 60 * 60 * 24)) : 0,
      };
    } catch (err) {
      console.warn('computeSLAForTicket failed', err);
    }
    return ticket;
  };

  // SLA color coding: use simple priority-based mapping (no server-side SLA status)
  const getSLAColor = (ticket: Ticket) => {
    switch (ticket.priority) {
      case 'high':
        return 'bg-red-600 text-white';
      case 'medium':
        return 'bg-yellow-400 text-black';
      case 'low':
        return 'bg-green-600 text-white';
      default:
        return 'bg-gray-200 text-gray-800';
    }
  };

  

  const handleTicketUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedTicket) {
      toast({
        title: "Error",
        description: "No ticket selected for update",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Not authenticated");

      // Insert the update record
      const { error: updateError } = await supabase
        .from('ticket_updates')
        .insert([{
          ticket_id: selectedTicket.id,
          status_from: selectedTicket.status,
          status_to: updateForm.status_to,
          admin_notes: updateForm.admin_notes,
          updated_by: user.id
        }]);

      if (updateError) throw updateError;

      // Update the ticket status
      const { error: ticketError } = await supabase
        .from('tickets')
        .update({ status: updateForm.status_to })
        .eq('id', selectedTicket.id);

      if (ticketError) throw ticketError;

      toast({
        title: "Ticket Updated",
        description: `Ticket ${selectedTicket.ticket_number} status updated successfully`,
      });

      // Refresh the tickets list
      await fetchAllTickets();
      
      // Close dialog and reset form
      setShowUpdateDialog(false);
      setUpdateForm({ status_to: '', admin_notes: '' });
      setSelectedTicket(null);
    } catch (error) {
      console.error('Error updating ticket:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to update ticket. Please try again.";
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const openUpdateDialog = (ticket: Ticket) => {
    setSelectedTicket(ticket);
    setUpdateForm({
      status_to: ticket.status,
      admin_notes: ''
    });
    setShowUpdateDialog(true);
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
      <div className="container mx-auto py-6 px-4">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4 w-full">
              <div>
                <h2 className="text-xl font-semibold">My Open Tickets Report</h2>
                <p className="text-sm text-muted-foreground">Manage and update all raised tickets</p>
              </div>
              <div className="flex items-center gap-2">
                
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="form-checkbox" checked={showFiltersLocal} onChange={(e) => setShowFiltersLocal(e.target.checked)} /> Show Filters
                </label>
                <Button variant="secondary" onClick={() => exportCSV()} className="ml-2">Export to CSV</Button>
                <Button variant="secondary" onClick={generateReport}>Export to PDF</Button>
                <Button variant="ghost" onClick={() => setShowEmailDialog(true)}>E-mail PDF</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Filters Section (toggleable) */}
            {showFiltersLocal && (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                

                <div>
                  <Label>Status</Label>
                  <Select value={filters.status} onValueChange={(value) => handleFilterChange('status', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="waiting-for-user">Waiting for User</SelectItem>
                      
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="procure-in-progress">Procure In Progress</SelectItem>
                      <SelectItem value="procure-completed">Procure Completed</SelectItem>
                      <SelectItem value="procure-approved">Procure Approved</SelectItem>
                      <SelectItem value="procure-rejected">Procure Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Priority</Label>
                  <Select value={filters.priority} onValueChange={(value) => handleFilterChange('priority', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Priorities" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priorities</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                

                <div>
                  <Label>Search</Label>
                  <div className="relative">
                    <Input
                      placeholder="Search tickets..."
                      value={filters.search}
                      onChange={(e) => handleFilterChange('search', e.target.value)}
                    />
                    <SearchIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  </div>
                </div>
              </div>
            )}

            {/* top table with summary */}
            <div className="mb-4 overflow-x-auto rounded border bg-white">
              <table className="w-full table-auto">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Ticket #</th>
                    <th className="px-3 py-2 text-left">SLA</th>
                    <th className="px-3 py-2 text-left">Customer</th>
                    <th className="px-3 py-2 text-left">Nature of Request</th>
                    <th className="px-3 py-2 text-left">SLA Respond By</th>
                    <th className="px-3 py-2 text-left">SLA Respond Days Over</th>
                    <th className="px-3 py-2 text-left">SLA Resolve By</th>
                    <th className="px-3 py-2 text-left">SLA Resolve Days Over</th>
                    <th className="px-3 py-2 text-left">Subject</th>
                    <th className="px-3 py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.slice(0, 5).map(ticket => (
                    <tr key={ticket.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-semibold">{ticket.ticket_number}</div>
                        <div className="text-xs text-muted-foreground">{new Date(ticket.created_at).toLocaleString()}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${getPriorityColor(ticket.priority)}`}>
                          {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                        </span>
                      </td>
                      <td className="px-3 py-2">{ticket.name}</td>
                      <td className="px-3 py-2 text-sm text-muted-foreground">
                        <Button variant="ghost" size="sm" onClick={() => setViewTicket(ticket)}>View</Button>
                      </td>
                      <td className="px-3 py-2">{ticket.sla?.respondByDisplay || '--'}</td>
                      <td className={`px-3 py-2 ${(((ticket as any).sla_status && ((ticket as any).sla_status === 'overdue-respond' || (ticket as any).sla_status === 'overdue-resolve')) || (ticket.sla?.respondDaysOver && ticket.sla.respondDaysOver>0)) ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                        {(() => {
                          const svr = (ticket as any).sla_status;
                          if (svr) {
                            if (svr === 'overdue-respond' || svr === 'overdue-resolve') {
                              const days = (ticket as any).respond_days_over ?? ticket.sla?.respondDaysOver ?? 0;
                              return `${days}d overdue`;
                            }
                            return 'On time';
                          }
                          if (ticket.sla) return (ticket.sla.respondDaysOver && ticket.sla.respondDaysOver > 0) ? `${ticket.sla.respondDaysOver}d overdue` : 'On time';
                          return '--';
                        })()}
                      </td>
                      <td className="px-3 py-2">{ticket.sla?.resolveByDisplay || '--'}</td>
                      <td className={`px-3 py-2 ${(((ticket as any).sla_status && ((ticket as any).sla_status === 'overdue-resolve' || (ticket as any).sla_status === 'overdue-respond')) || (ticket.sla?.resolveDaysOver && ticket.sla.resolveDaysOver>0)) ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                        {(() => {
                          const svr = (ticket as any).sla_status;
                          if (svr) {
                            if (svr === 'overdue-resolve' || svr === 'overdue-respond') {
                              const days = (ticket as any).resolve_days_over ?? ticket.sla?.resolveDaysOver ?? 0;
                              return `${days}d overdue`;
                            }
                            return 'On time';
                          }
                          if (ticket.sla) return (ticket.sla.resolveDaysOver && ticket.sla.resolveDaysOver > 0) ? `${ticket.sla.resolveDaysOver}d overdue` : 'On time';
                          return '--';
                        })()}
                      </td>
                      <td className="px-3 py-2">{ticket.issue_category}</td>
                      <td className="px-3 py-2">
                        <Button variant="outline" size="sm" onClick={() => openUpdateDialog(ticket)}>Update</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center gap-4 mb-4">
              <div className="h-3 w-3 bg-green-600 rounded"></div>
              <div className="text-sm">Under SLA Resolution</div>
              <div className="h-3 w-3 bg-yellow-400 rounded ml-4"></div>
              <div className="text-sm">Within 45 minutes of SLA Resolution</div>
              <div className="h-3 w-3 bg-red-600 rounded ml-4"></div>
              <div className="text-sm">Over SLA Resolution</div>
            </div>

            {/* Ticket grid by status */}
            <div className="mt-4">
              <h3 className="text-lg font-semibold mb-3">Open Tickets by Service Group Membership</h3>
              <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
                <div>
                  <div className="text-sm text-muted-foreground">New Tickets</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tickets.filter(t => t.status === 'pending').slice(0, 20).map(t => (
                      <button key={t.id} onClick={() => openUpdateDialog(t)} className={`px-2 py-1 rounded text-xs ${getSLAColor(t)} cursor-pointer`}>{t.ticket_number}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Assigned Tickets</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tickets.filter(t => t.status === 'in-progress').slice(0, 20).map(t => (
                      <button key={t.id} onClick={() => openUpdateDialog(t)} className={`px-2 py-1 rounded text-xs ${getSLAColor(t)} cursor-pointer`}>{t.ticket_number}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">In-Progress Tickets</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tickets.filter(t => t.status === 'in-progress').slice(0, 20).map(t => (
                      <button key={t.id} onClick={() => openUpdateDialog(t)} className={`px-2 py-1 rounded text-xs ${getSLAColor(t)} cursor-pointer`}>{t.ticket_number}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Completed Tickets</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tickets.filter(t => t.status === 'completed').slice(0, 20).map(t => (
                      <button key={t.id} onClick={() => openUpdateDialog(t)} className={`px-2 py-1 rounded text-xs ${getSLAColor(t)} cursor-pointer`}>{t.ticket_number}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">On Hold Tickets</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tickets.filter(t => t.status === 'waiting-for-user').slice(0, 20).map(t => (
                      <button key={t.id} onClick={() => openUpdateDialog(t)} className={`px-2 py-1 rounded text-xs ${getSLAColor(t)} cursor-pointer`}>{t.ticket_number}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Awaiting Customer Response</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tickets.filter(t => t.status === 'waiting-for-user').slice(0, 20).map(t => (
                      <button key={t.id} onClick={() => openUpdateDialog(t)} className={`px-2 py-1 rounded text-xs ${getSLAColor(t)} cursor-pointer`}>{t.ticket_number}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Approval Pending Tickets</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tickets.filter(t => t.status.startsWith('procure')).slice(0, 20).map(t => (
                      <button key={t.id} onClick={() => openUpdateDialog(t)} className={`px-2 py-1 rounded text-xs ${getSLAColor(t)} cursor-pointer`}>{t.ticket_number}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <PaginationControls
                currentPage={pagination.page}
                totalPages={Math.ceil(pagination.total / pagination.pageSize)}
                pageSize={pagination.pageSize}
                totalItems={pagination.total}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          </CardContent>
        </Card>

        {/* Email PDF Dialog */}
        <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>E-mail Ticket Report</DialogTitle>
              <DialogDescription>Send the generated ticket report as a PDF attachment to a recipient email address.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>To</Label>
                <Input value={emailForm.to} onChange={(e) => setEmailForm(prev => ({ ...prev, to: e.target.value }))} placeholder="recipient@example.com" />
              </div>
              <div>
                <Label>Subject</Label>
                <Input value={emailForm.subject} onChange={(e) => setEmailForm(prev => ({ ...prev, subject: e.target.value }))} />
              </div>
              <div>
                <Label>Body</Label>
                <Textarea value={emailForm.body} onChange={(e) => setEmailForm(prev => ({ ...prev, body: e.target.value }))} rows={4} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowEmailDialog(false)}>Cancel</Button>
                <Button onClick={() => sendReportByEmail(emailForm.to, emailForm.subject, emailForm.body)}>Send Email</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      {/* Update Ticket Dialog */}
      <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Ticket</DialogTitle>
            <DialogDescription>Change the ticket status and add administrative notes for tracking.</DialogDescription>
          </DialogHeader>
          
          {selectedTicket && (
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold">Ticket #{selectedTicket.ticket_number}</h3>
                <div className="text-sm text-muted-foreground">
                  {renderTicketDescription(selectedTicket)}
                </div>
              </div>
              
              <form onSubmit={handleTicketUpdate} className="space-y-4">
                <div>
                  <Label htmlFor="status_to">New Status</Label>
                  <Select 
                    value={updateForm.status_to} 
                    onValueChange={(value) => setUpdateForm(prev => ({ ...prev, status_to: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select new status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="in-progress">In Progress</SelectItem>
                      <SelectItem value="waiting-for-user">Waiting for User</SelectItem>
                      
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="admin_notes">Admin Notes</Label>
                  <Textarea
                    id="admin_notes"
                    value={updateForm.admin_notes}
                    onChange={(e) => setUpdateForm(prev => ({ ...prev, admin_notes: e.target.value }))}
                    placeholder="Add notes about the update, resolution details, or any other relevant information..."
                    rows={4}
                  />
                </div>
                
                <div className="flex justify-end space-x-2 pt-4">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setShowUpdateDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Update Ticket</Button>
                </div>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View Nature Dialog */}
      <Dialog open={!!viewTicket} onOpenChange={(open) => { if (!open) setViewTicket(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nature of Request</DialogTitle>
            <DialogDescription>Full details of the ticket request.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {viewTicket ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Ticket #</div>
                    <div className="font-medium">{viewTicket.ticket_number}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div className="font-medium">{viewTicket.status}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Priority</div>
                    <div className="font-medium">{viewTicket.priority.charAt(0).toUpperCase() + viewTicket.priority.slice(1)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Customer</div>
                    <div className="font-medium">{viewTicket.name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Department</div>
                    <div className="font-medium">{viewTicket.department || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Category</div>
                    <div className="font-medium">{viewTicket.issue_category}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Contact</div>
                    <div className="font-medium">{viewTicket.contact_number || viewTicket.phone || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Email</div>
                    <div className="font-medium">{viewTicket.email || '-'}</div>
                  </div>
                </div>

                <div className="text-sm mt-2">
                  <div className="text-xs text-muted-foreground">Subject / Details</div>
                  <div className="mt-1">{viewTicket.issue_category === 'procure' ? renderTicketDescription(viewTicket) : <div className="whitespace-pre-wrap">{viewTicket.issue_description}</div>}</div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Created</div>
                    <div className="font-medium">{viewTicket.created_at ? format(new Date(viewTicket.created_at), 'PP p') : '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Updated</div>
                    <div className="font-medium">{viewTicket.updated_at ? format(new Date(viewTicket.updated_at), 'PP p') : '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Attachments</div>
                    <div className="font-medium">{(viewTicket.issue_category === 'procure' && viewTicket.issue_description && String(viewTicket.issue_description).includes('Approval Letter')) ? 'Approval letter attached' : (viewTicket.attachment_url ? <a href={viewTicket.attachment_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">View</a> : '-')}</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">No ticket selected</div>
            )}
            <div className="flex justify-end mt-4">
              <Button variant="outline" onClick={() => setViewTicket(null)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </Layout>
  );
};

export default AdminTicketDashboard;