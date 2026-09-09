import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import Layout from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, CheckCircle, XCircle, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { usePagination } from '@/hooks/use-pagination';
import { PaginationControls } from '@/components/PaginationControls';
import { createPaginatedQuery } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';

const PrincipalDashboard = () => {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const {
    pagination,
    setPage,
    setPageSize,
    setTotal,
  } = usePagination(10, 1);

  const [departments, setDepartments] = useState<any[]>([]);
  const [filters, setFilters] = useState({ department: '', priority: '', search: '', overdueOnly: false, from: '', to: '' });
  const [searchInput, setSearchInput] = useState<string>('');
  const [metrics, setMetrics] = useState({ pending: 0, inProgress: 0, approved: 0, rejected: 0, overdue: 0 });
  const [viewTicket, setViewTicket] = useState<any | null>(null);
  const [viewTicketUpdates, setViewTicketUpdates] = useState<any[]>([]);
  const [actionNote, setActionNote] = useState('');
  const [remoteError, setRemoteError] = useState(false);

  const SLA_RULES: Record<string, { respondHours: number; resolveHours: number }> = {
    high: { respondHours: 1, resolveHours: 8 },
    medium: { respondHours: 4, resolveHours: 48 },
    low: { respondHours: 24, resolveHours: 168 },
  };

  const computeSLAForTicket = (ticket: any) => {
    try {
      const now = new Date();
      const rule = SLA_RULES[ticket.priority] || SLA_RULES['low'];
      const created = new Date(ticket.created_at);
      const respondBy = new Date(created.getTime() + rule.respondHours * 60 * 60 * 1000);
      const resolveBy = new Date(created.getTime() + rule.resolveHours * 60 * 60 * 1000);
      const respondDiff = now.getTime() - respondBy.getTime();
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
      console.warn('computeSLA failed', err);
    }
    return ticket;
  };

  const getPriorityColor = (priority: string) => {
    switch (String(priority)) {
      case 'low':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200';
      case 'medium':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-200';
      case 'high':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusColor = (status: string) => {
    switch (String(status)) {
      case 'completed':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200';
      case 'procure-approved':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200';
      case 'service-approved':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200';
      case 'procure-rejected':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-900/20 dark:text-rose-200';
      case 'service-rejected':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-900/20 dark:text-rose-200';
      case 'in-progress':
        return 'bg-sky-100 text-sky-800 dark:bg-sky-900/20 dark:text-sky-200';
      case 'pending_principal':
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const fetchMetrics = useCallback(async () => {
    try {
      const [pendingRes, inProgRes, approvedRes, rejectedRes] = await Promise.all([
        supabase.from('tickets').select('id', { head: true, count: 'exact' }).eq('status', 'pending_principal'),
        supabase.from('tickets').select('id', { head: true, count: 'exact' }).eq('status', 'in-progress'),
        supabase.from('tickets').select('id', { head: true, count: 'exact' }).in('status', ['procure-approved', 'service-approved']),
        supabase.from('tickets').select('id', { head: true, count: 'exact' }).in('status', ['procure-rejected', 'service-rejected']),
      ]);
      // compute overdue tickets: tickets in active statuses that have passed resolve deadline
      const now = new Date();
      const activeStatuses = ['pending', 'pending_principal', 'in-progress'];

      const counts = await Promise.all(Object.entries(SLA_RULES).map(async ([priority, rule]) => {
        const cutoff = new Date(now.getTime() - rule.resolveHours * 60 * 60 * 1000).toISOString();
        const { count } = await supabase
          .from('tickets')
          .select('id', { head: true, count: 'exact' })
          .eq('priority', priority)
          .lte('created_at', cutoff)
          .in('status', activeStatuses);
        return count || 0;
      }));

      const overdueCount = counts.reduce((s, c) => s + (c || 0), 0);

      setMetrics({
        pending: pendingRes.count || 0,
        inProgress: inProgRes.count || 0,
        approved: approvedRes.count || 0,
        rejected: rejectedRes.count || 0,
        overdue: overdueCount || 0,
      });
    } catch (e) {
      console.error('fetchMetrics failed', e);
      setRemoteError(true);
    }
  }, []);

  // recent activity removed — no longer fetching updates here

  const fetchDepartments = useCallback(async () => {
    try {
      const { data } = await supabase.from('departments').select('*').order('name');
      setDepartments(data || []);
    } catch (e) {
      console.error('load depts', e);
      setRemoteError(true);
    }
  }, []);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      // fetch HOD ids
      const { data: hods } = await supabase.from('user_roles').select('user_id').eq('role', 'hod');
      const hodIds = (hods || []).map((h: any) => h.user_id).filter(Boolean);
      if (hodIds.length === 0) {
        setTickets([]); setTotal(0); setLoading(false); return;
      }

      let query = supabase.from('tickets').select('*', { count: 'exact' }).in('created_by', hodIds).order('created_at', { ascending: false });

      // apply filters
      if (filters.department && filters.department !== 'all') query = query.eq('department', filters.department);
      if (filters.priority && filters.priority !== 'any') query = query.eq('priority', filters.priority);
      if (filters.search) {
        const esc = String(filters.search || '').trim().replace(/%/g, '\\%').replace(/,/g, '');
        if (esc !== '') {
          query = query.or(`ticket_number.ilike.%${esc}%,name.ilike.%${esc}%`);
        }
      }
      if (filters.from) query = query.gte('created_at', filters.from);
      if (filters.to) query = query.lte('created_at', filters.to);

      query = createPaginatedQuery(query, pagination.page, pagination.pageSize);
      const { data, error, count } = await query;
      if (error) throw error;
      const computed = (data || []).map((t: any) => computeSLAForTicket(t));
      const filtered = filters.overdueOnly ? computed.filter((t: any) => (t.sla?.respondDaysOver || 0) > 0 || (t.sla?.resolveDaysOver || 0) > 0) : computed;
      setTickets(filtered);
      setTotal(count || 0);
    } catch (e) {
      console.error('fetchTickets failed', e);
      toast({ title: 'Error', description: 'Failed to load tickets', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.pageSize, setTotal, toast]);

  // Poll metrics and tickets periodically for near-real-time numbers
  useEffect(() => {
    const interval = setInterval(() => {
      if (!remoteError) {
        fetchMetrics();
        fetchTickets();
      }
    }, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, [fetchMetrics, fetchTickets, remoteError]);

  const { userId, primaryRole } = useAuth();
  const navigate = useNavigate();

  const openTicketDetails = async (t: any) => {
    try {
      const ticket = computeSLAForTicket(t);
      setViewTicket(ticket);
      // fetch ticket updates (admin notes / history)
      const { data, error } = await supabase
        .from('ticket_updates')
        .select('*')
        .eq('ticket_id', t.id)
        .order('created_at', { ascending: false });
      if (error) {
        console.warn('Failed to load ticket updates', error);
        setViewTicketUpdates([]);
      } else {
        setViewTicketUpdates(data || []);
      }
    } catch (e) {
      console.error('openTicketDetails failed', e);
      setViewTicketUpdates([]);
    }
  };

  const approveTicket = async (ticket: any) => {
    try {
      // ask for an optional principal note
      const principalNotes = window.prompt('Optional note to attach with approval:', '') || null;

      // mark as approved
      const { error: updErr } = await supabase
        .from('tickets')
        .update({ status: 'procure-approved' })
        .eq('id', ticket.id);
      if (updErr) throw updErr;

      // insert ticket update
      await supabase.from('ticket_updates').insert([{ ticket_id: ticket.id, status_from: ticket.status, status_to: 'procure-approved', admin_notes: principalNotes || 'Approved by Principal', updated_by: userId }]);

      await logAudit('approve_ticket', userId, { ticket_id: ticket.id, ticket_number: ticket.ticket_number });

      // notify ticket owner (HOD who raised it)
      try {
        const ownerId = ticket.created_by;
        const { default: sendNotification } = await import('@/lib/notify');
        await sendNotification(ownerId, `Your request ${ticket.ticket_number} was approved by Principal`, { ticket_id: ticket.id });
      } catch (e) {
        console.warn('notify owner failed', e);
      }

      // notify admins so they can pick up the approved request
      try {
        const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin');
        const adminIds = (admins || []).map((a: any) => a.user_id).filter(Boolean);
        if (adminIds.length > 0) {
          const { default: sendNotification } = await import('@/lib/notify');
          await Promise.all(adminIds.map((aid: string) => sendNotification(aid, `Request ${ticket.ticket_number} approved by Principal`, { ticket_id: ticket.id })));
        }
      } catch (e) {
        console.warn('notify admins failed', e);
      }

      toast({ title: 'Approved', description: `Ticket ${ticket.ticket_number} approved` });
      fetchTickets();
    } catch (err) {
      console.error('Approve failed', err);
      toast({ title: 'Error', description: 'Failed to approve request', variant: 'destructive' });
    }
  };

  const rejectTicket = async (ticket: any) => {
    try {
      const reason = window.prompt('Reason for rejection (visible to requester):', '') || 'Rejected by Principal';
      const { error: updErr } = await supabase
        .from('tickets')
        .update({ status: 'procure-rejected' })
        .eq('id', ticket.id);
      if (updErr) throw updErr;

      await supabase.from('ticket_updates').insert([{ ticket_id: ticket.id, status_from: ticket.status, status_to: 'procure-rejected', admin_notes: reason, updated_by: userId }]);
      await logAudit('reject_ticket', userId, { ticket_id: ticket.id, ticket_number: ticket.ticket_number, reason });

      try {
        const ownerId = ticket.created_by;
        const { default: sendNotification } = await import('@/lib/notify');
        await sendNotification(ownerId, `Your request ${ticket.ticket_number} was rejected by Principal: ${reason}`, { ticket_id: ticket.id });
      } catch (e) {
        console.warn('notify owner failed', e);
      }

      toast({ title: 'Rejected', description: `Ticket ${ticket.ticket_number} rejected` });
      fetchTickets();
    } catch (err) {
      console.error('Reject failed', err);
      toast({ title: 'Error', description: 'Failed to reject request', variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (primaryRole !== 'principle' && primaryRole !== 'principal') {
      navigate({ to: '/' });
      return;
    }
    if (remoteError) {
      // stop further fetching when remote service is failing; show a toast once
      toast({ title: 'Service unavailable', description: 'Supabase appears unreachable — data fetches paused.', variant: 'destructive' });
      return;
    }
    fetchDepartments();
    fetchMetrics();
    fetchTickets();
  }, [fetchTickets, fetchDepartments, fetchMetrics, primaryRole, navigate, remoteError, toast]);

  // Actions: approve/reject/escalate/assign
  const performAction = async (type: 'approve' | 'reject' | 'escalate' | 'assign', ticket: any, note: string | null, payload?: any) => {
    try {
      if (type === 'approve') {
        const newStatus = ticket.issue_category === 'procure' ? 'procure-approved' : 'service-approved';
        const { error } = await supabase.from('tickets').update({ status: newStatus }).eq('id', ticket.id);
        if (error) throw error;
        await supabase.from('ticket_updates').insert([{ ticket_id: ticket.id, status_from: ticket.status, status_to: newStatus, admin_notes: note || 'Approved by Principal', updated_by: userId }]);
        await logAudit('principal_approve', userId, { ticket_id: ticket.id, ticket_number: ticket.ticket_number });
        try { const { data: admins } = await supabase.from('user_roles').select('user_id').eq('role', 'admin'); const adminIds = (admins||[]).map((a:any)=>a.user_id).filter(Boolean); if (adminIds.length){ const { default: sendNotification } = await import('@/lib/notify'); await Promise.all(adminIds.map((aid:string)=> sendNotification(aid, `Request ${ticket.ticket_number} approved by Principal`, { ticket_id: ticket.id }))); } } catch(e){console.warn(e)}
      } else if (type === 'reject') {
        const reason = note || 'Rejected by Principal';
        const newStatus = ticket.issue_category === 'procure' ? 'procure-rejected' : 'service-rejected';
        const { error } = await supabase.from('tickets').update({ status: newStatus }).eq('id', ticket.id);
        if (error) throw error;
        await supabase.from('ticket_updates').insert([{ ticket_id: ticket.id, status_from: ticket.status, status_to: newStatus, admin_notes: reason, updated_by: userId }]);
        await logAudit('principal_reject', userId, { ticket_id: ticket.id, ticket_number: ticket.ticket_number, reason });
        try { const { default: sendNotification } = await import('@/lib/notify'); await sendNotification(ticket.created_by, `Your request ${ticket.ticket_number} was rejected by Principal: ${reason}`, { ticket_id: ticket.id }); } catch(e){console.warn(e)}
      } else if (type === 'escalate') {
        await supabase.from('ticket_updates').insert([{ ticket_id: ticket.id, status_from: ticket.status, status_to: ticket.status, admin_notes: note || 'Escalated by Principal', updated_by: userId }]);
        await logAudit('principal_escalate', userId, { ticket_id: ticket.id, ticket_number: ticket.ticket_number });
      } else if (type === 'assign') {
        const assignee = payload?.assignee;
        if (!assignee) throw new Error('Assignee required');
        await supabase.from('ticket_updates').insert([{ ticket_id: ticket.id, status_from: ticket.status, status_to: ticket.status, admin_notes: `Assigned to ${assignee}`, updated_by: userId }]);
        await supabase.from('tickets').update({ assigned_to: assignee }).eq('id', ticket.id);
        await logAudit('principal_assign', userId, { ticket_id: ticket.id, ticket_number: ticket.ticket_number, assignee });
      }
      await fetchMetrics();
      await fetchTickets();
      toast({ title: 'Success', description: 'Action completed' });
      return true;
    } catch (e) {
      console.error('performAction failed', e);
      toast({ title: 'Error', description: 'Action failed', variant: 'destructive' });
      return false;
    }
  };

  if (loading) return (
    <Layout>
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    </Layout>
  );

  return (
    <Layout>
      <div className="container mx-auto py-6 px-4 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl font-bold flex items-center gap-2">
                  <Activity className="w-6 h-6 text-emerald-600" />
                  Principal Dashboard
                </CardTitle>
                <p className="text-sm text-muted-foreground">System overview · pending approvals</p>
              </div>
              <div className="flex items-center gap-3">
                <Input placeholder="Search ticket # or requester" value={searchInput} onChange={(e) => setSearchInput((e.target as HTMLInputElement).value)} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} />
                <Button size="sm" onClick={() => { setPage(1); setFilters((p) => ({ ...p, search: searchInput })); fetchTickets(); }}>Apply</Button>
                <Button size="sm" onClick={() => navigate({ to: '/principal/approvals' })}>Approve Requests</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Metrics row */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
              <div className="p-4 rounded-xl bg-gradient-to-r from-yellow-50 to-yellow-100 shadow-sm">
                <div className="text-xs text-muted-foreground flex items-center gap-2"><CalendarIcon className="w-4 h-4 text-yellow-600" /> Pending Approval</div>
                <div className="text-2xl font-semibold text-yellow-800">{metrics.pending}</div>
              </div>
              <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-sky-50 shadow-sm">
                <div className="text-xs text-muted-foreground flex items-center gap-2"><Activity className="w-4 h-4 text-sky-600" /> In Progress</div>
                <div className="text-2xl font-semibold text-sky-800">{metrics.inProgress}</div>
              </div>
              <div className="p-4 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 shadow-sm">
                <div className="text-xs text-muted-foreground flex items-center gap-2"><CheckCircle className="w-4 h-4 text-emerald-600" /> Approved</div>
                <div className="text-2xl font-semibold text-emerald-800">{metrics.approved}</div>
              </div>
              <div className="p-4 rounded-xl bg-gradient-to-r from-rose-50 to-rose-100 shadow-sm">
                <div className="text-xs text-muted-foreground flex items-center gap-2"><XCircle className="w-4 h-4 text-rose-600" /> Rejected</div>
                <div className="text-2xl font-semibold text-rose-800">{metrics.rejected}</div>
              </div>
              <div className="p-4 rounded-xl bg-gradient-to-r from-gray-50 to-zinc-50 shadow-sm">
                <div className="text-xs text-muted-foreground flex items-center gap-2">Overdue</div>
                <div className="text-2xl font-semibold text-gray-800">{metrics.overdue}</div>
              </div>
            </div>

            <div className="grid gap-4">
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <Select value={filters.department} onValueChange={(v) => setFilters((p) => ({ ...p, department: v }))}>
                    <SelectTrigger className="w-60"><SelectValue placeholder="All Departments" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Departments</SelectItem>
                      {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={filters.priority} onValueChange={(v) => setFilters((p) => ({ ...p, priority: v }))}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="Priority" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={filters.overdueOnly} onChange={(e) => setFilters((p) => ({ ...p, overdueOnly: (e.target as HTMLInputElement).checked }))} /> Overdue only</label>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full table-fixed">
                    <colgroup>
                      <col style={{ width: '18%' }} />
                      <col style={{ width: '18%' }} />
                      <col style={{ width: '18%' }} />
                      <col style={{ width: '12%' }} />
                      <col style={{ width: '18%' }} />
                      <col style={{ width: '16%' }} />
                    </colgroup>
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-3 py-2 text-left">Ticket #</th>
                        <th className="px-3 py-2 text-left">Department</th>
                        <th className="px-3 py-2 text-left">Requester</th>
                        <th className="px-3 py-2 text-left">Priority</th>
                        <th className="px-3 py-2 text-left">SLA</th>
                        <th className="px-3 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tickets.map(t => (
                        <tr key={t.id} className="border-t">
                          <td className="px-3 py-2 align-middle"><div className="truncate max-w-full">{t.ticket_number}</div></td>
                          <td className="px-3 py-2 align-middle"><div className="truncate max-w-full">{(() => {
                            const found = departments.find(d => String(d.id) === String(t.department) || String(d.id) === String(t.department_id));
                            return found ? found.name : (t.department_name || t.department || '—');
                          })()}</div></td>
                          <td className="px-3 py-2 align-middle"><div className="truncate max-w-full">{t.name}</div></td>
                          <td className="px-3 py-2 align-middle"><div className="inline-block"><Badge className={getPriorityColor(t.priority)}>{String(t.priority || '').charAt(0).toUpperCase() + String(t.priority || '').slice(1)}</Badge></div></td>
                          <td className="px-3 py-2 align-middle"><div className="truncate max-w-full">{t.sla?.respondDaysOver ? (<Badge className="bg-rose-100 text-rose-800">{`${t.sla.respondDaysOver}d overdue`}</Badge>) : (<span className="text-sm text-muted-foreground">{t.sla?.respondByDisplay}</span>)}</div></td>
                          <td className="px-3 py-2 align-middle text-right"><div className="inline-flex items-center justify-end gap-2"><Button size="sm" onClick={() => openTicketDetails(t)}>View</Button><Button size="sm" onClick={() => { openTicketDetails(t); setActionNote(''); }}>Actions</Button></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4">
                  <PaginationControls
                    currentPage={pagination.page}
                    totalPages={Math.ceil(pagination.total / pagination.pageSize)}
                    pageSize={pagination.pageSize}
                    totalItems={pagination.total}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                  />
                </div>
              </div>

              {/* Recent Activity removed per request */}
            </div>
          </CardContent>
        </Card>

        {/* Detail dialog */}
        <Dialog open={!!viewTicket} onOpenChange={(open) => { if (!open) setViewTicket(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ticket Details</DialogTitle>
              <DialogDescription>Full details, history and actions</DialogDescription>
            </DialogHeader>
            {viewTicket ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Ticket #</div>
                    <div className="font-medium">{viewTicket.ticket_number}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div className="font-medium"><Badge className={getStatusColor(viewTicket.status)}>{String(viewTicket.status).replace('-', ' ').toUpperCase()}</Badge></div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Priority</div>
                    <div className="font-medium"><Badge className={getPriorityColor(viewTicket.priority)}>{String(viewTicket.priority || '').toUpperCase()}</Badge></div>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground">Details</div>
                  <div className="mt-1 whitespace-pre-wrap">{viewTicket.issue_description}</div>
                </div>

                <div>
                  <Label>Action Note</Label>
                  <Textarea value={actionNote} onChange={(e) => setActionNote((e.target as HTMLTextAreaElement).value)} placeholder="Optional note for approve/reject/escalate" />
                </div>

                {/* Admin / Ticket updates */}
                <div>
                  <div className="text-xs text-muted-foreground">Admin Updates</div>
                  <div className="mt-2 space-y-3">
                    {viewTicketUpdates.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No updates found.</div>
                    ) : (
                      viewTicketUpdates.map((u) => (
                        <div key={u.id} className="p-3 border rounded bg-gray-50">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-medium">{String(u.status_from || '').toUpperCase()} → {String(u.status_to || '').toUpperCase()}</div>
                            <div className="text-xs text-muted-foreground">{u.created_at ? format(new Date(u.created_at), 'PP p') : ''}</div>
                          </div>
                          <div className="text-sm mt-2 whitespace-pre-wrap">{u.admin_notes || '-'}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setViewTicket(null)}>Close</Button>
                  <Button disabled title="Actions disabled in view mode">Escalate</Button>
                  <Button variant="destructive" disabled title="Actions disabled in view mode">Reject</Button>
                  <Button disabled title="Actions disabled in view mode">Approve</Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default PrincipalDashboard;
