import { useEffect, useState, useCallback } from 'react';
import { usePagination } from '@/hooks/use-pagination';
import { createPaginatedQuery } from '@/lib/utils';
import { PaginationControls } from '@/components/PaginationControls';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { format } from 'date-fns';

interface Ticket {
  id: string;
  ticket_number: string;
  name: string;
  email: string;
  contact_number?: string | null;
  department?: string | null;
  issue_category: string;
  issue_description: string;
  priority: 'low' | 'medium' | 'high';
  status: string;
  created_at: string;
  updated_at?: string;
  sla?: {
    respondByDisplay?: string;
    respondDaysOver?: number;
    resolveByDisplay?: string;
    resolveDaysOver?: number;
  };
}

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
    const rule = SLA_RULES[ticket.priority] || SLA_RULES['low'];
    const created = new Date(ticket.created_at);
    if (isNaN(created.getTime())) return ticket;

    const respondBy = new Date(created.getTime() + rule.respondHours * 60 * 60 * 1000);
    const resolveBy = new Date(created.getTime() + rule.resolveHours * 60 * 60 * 1000);
    const respondDiff = now.getTime() - respondBy.getTime();
    const resolveDiff = now.getTime() - resolveBy.getTime();

    ticket.sla = {
      respondByDisplay: respondBy ? format(respondBy, 'PP p') : undefined,
      respondDaysOver: respondDiff > 0 ? Math.floor(respondDiff / (1000 * 60 * 60 * 24)) : 0,
      resolveByDisplay: resolveBy ? format(resolveBy, 'PP p') : undefined,
      resolveDaysOver: resolveDiff > 0 ? Math.floor(resolveDiff / (1000 * 60 * 60 * 24)) : 0,
    };
  } catch (err) {
    // ignore
  }
  return ticket;
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

const ViewerTickets = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: 'all', priority: 'all', search: '' });
  const [viewTicket, setViewTicket] = useState<Ticket | null>(null);
  const { toast } = useToast();

  const { pagination, setPage, setPageSize, setTotal, resetPagination } = usePagination(10, 1);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('tickets').select('*', { count: 'exact' }).order('created_at', { ascending: false });
      if (filters.status !== 'all') query = query.eq('status', filters.status);
      if (filters.priority !== 'all') query = query.eq('priority', filters.priority);
      const search = String(filters.search || '').trim();
      if (search) {
        const esc = search.replace(/%/g, '\\%').replace(/,/g, '');
        query = query.or(`ticket_number.ilike.%${esc}%,name.ilike.%${esc}%,email.ilike.%${esc}%,issue_description.ilike.%${esc}%`);
      }

      // apply pagination
      query = createPaginatedQuery(query, pagination.page, pagination.pageSize);

      const { data, error, count } = await query;
      if (error) throw error;
      const withSLA = (data || []).map((t: any) => computeSLAForTicket(t));
      setTickets(withSLA as Ticket[]);
      setTotal(count || 0);
    } catch (err) {
      console.error('Failed to fetch tickets', err);
      toast({ title: 'Error', description: 'Failed to load tickets', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [filters, toast, pagination.page, pagination.pageSize, setTotal]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  const exportCSV = () => {
    try {
      if (!tickets || tickets.length === 0) {
        toast({ title: 'Info', description: 'No tickets to export' });
        return;
      }
      const headers = ['ticket_number','name','email','department','issue_category','priority','status','created_at'];
      const rows = tickets.map(t => [t.ticket_number, t.name, t.email, (t.department||''), t.issue_category, t.priority, t.status, t.created_at]);
      const csvContent = [headers.join(','), ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g,'""')}"`).join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `viewer-tickets-${format(new Date(), 'yyyy-MM-dd')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
      toast({ title: 'Error', description: 'Failed to export CSV', variant: 'destructive' });
    }
  };

  const generateReportPdf = () => {
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Viewer Tickets Report', 20, 20);
      const rows = tickets.map(t => [t.ticket_number, t.name, t.issue_category, t.priority, t.status, format(new Date(t.created_at), 'PP p')]);
      (doc as any).autoTable({ head: [['Ticket #','Customer','Category','Priority','Status','Created']], body: rows, startY: 30 });
      doc.save(`viewer-tickets-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast({ title: 'Success', description: 'PDF downloaded' });
    } catch (err) {
      console.error('PDF error', err);
      toast({ title: 'Error', description: 'Failed to generate PDF', variant: 'destructive' });
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-start justify-between w-full">
          <div>
            <h2 className="text-xl font-semibold">My Open Tickets Report</h2>
            <p className="text-sm text-muted-foreground">Manage and view raised tickets (read-only)</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={exportCSV}>Export to CSV</Button>
            <Button variant="secondary" onClick={generateReportPdf}>Export to PDF</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <div>
            <Label>Status</Label>
            <Select value={filters.status} onValueChange={(v) => setFilters(prev => ({ ...prev, status: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in-progress">In Progress</SelectItem>
                <SelectItem value="waiting-for-user">Waiting for User</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Priority</Label>
            <Select value={filters.priority} onValueChange={(v) => setFilters(prev => ({ ...prev, priority: v }))}>
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

          <div className="md:col-span-3">
            <Label>Search</Label>
            <Input placeholder="Search tickets..." value={filters.search} onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))} />
          </div>
        </div>

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
              {tickets.slice(0, 10).map(ticket => (
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
                  <td className={`px-3 py-2 ${ticket.sla?.respondDaysOver && ticket.sla.respondDaysOver>0 ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                    {ticket.sla ? (ticket.sla.respondDaysOver && ticket.sla.respondDaysOver > 0 ? `${ticket.sla.respondDaysOver}d overdue` : 'On time') : '--'}
                  </td>
                  <td className="px-3 py-2">{ticket.sla?.resolveByDisplay || '--'}</td>
                  <td className={`px-3 py-2 ${ticket.sla?.resolveDaysOver && ticket.sla.resolveDaysOver>0 ? 'text-red-600 font-semibold' : 'text-muted-foreground'}`}>
                    {ticket.sla ? (ticket.sla.resolveDaysOver && ticket.sla.resolveDaysOver > 0 ? `${ticket.sla.resolveDaysOver}d overdue` : 'On time') : '--'}
                  </td>
                  <td className="px-3 py-2">{ticket.issue_category}</td>
                  <td className="px-3 py-2">
                    <Button variant="outline" size="sm" onClick={() => setViewTicket(ticket)}>View</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4">
          <h3 className="text-lg font-semibold mb-3">Open Tickets by Service Group Membership</h3>
          <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
            <div>
              <div className="text-sm text-muted-foreground">New Tickets</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {tickets.filter(t => t.status === 'pending').slice(0, 20).map(t => (
                  <div key={t.id} className={`px-2 py-1 rounded text-xs ${getSLAColor(t)}`}>{t.ticket_number}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Assigned Tickets</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {tickets.filter(t => t.status === 'in-progress').slice(0, 20).map(t => (
                  <div key={t.id} className={`px-2 py-1 rounded text-xs ${getSLAColor(t)}`}>{t.ticket_number}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">In-Progress Tickets</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {tickets.filter(t => t.status === 'in-progress').slice(0, 20).map(t => (
                  <div key={t.id} className={`px-2 py-1 rounded text-xs ${getSLAColor(t)}`}>{t.ticket_number}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Completed Tickets</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {tickets.filter(t => t.status === 'completed').slice(0, 20).map(t => (
                  <div key={t.id} className={`px-2 py-1 rounded text-xs ${getSLAColor(t)}`}>{t.ticket_number}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">On Hold Tickets</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {tickets.filter(t => t.status === 'waiting-for-user').slice(0, 20).map(t => (
                  <div key={t.id} className={`px-2 py-1 rounded text-xs ${getSLAColor(t)}`}>{t.ticket_number}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Awaiting Customer Response</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {tickets.filter(t => t.status === 'waiting-for-user').slice(0, 20).map(t => (
                  <div key={t.id} className={`px-2 py-1 rounded text-xs ${getSLAColor(t)}`}>{t.ticket_number}</div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground">Approval Pending Tickets</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {tickets.filter(t => t.status.startsWith('procure')).slice(0, 20).map(t => (
                  <div key={t.id} className={`px-2 py-1 rounded text-xs ${getSLAColor(t)}`}>{t.ticket_number}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <PaginationControls
          currentPage={pagination.page}
          totalPages={Math.ceil(pagination.total / pagination.pageSize)}
          pageSize={pagination.pageSize}
          totalItems={pagination.total}
          currentItemsCount={tickets.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />

        {/* View Dialog */}
        <Dialog open={!!viewTicket} onOpenChange={(open) => { if (!open) setViewTicket(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nature of Request</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {viewTicket ? (
                <>
                  <div className="text-xs text-muted-foreground">Ticket #</div>
                  <div className="font-medium">{viewTicket.ticket_number}</div>
                  <div className="text-xs text-muted-foreground">Subject / Details</div>
                  <div className="whitespace-pre-wrap">{viewTicket.issue_description}</div>
                </>
              ) : (
                <div className="text-sm text-muted-foreground">No ticket selected</div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default ViewerTickets;
