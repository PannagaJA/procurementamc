import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { supabase } from '@/integrations/supabase/client';
import Layout from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { usePagination } from '@/hooks/use-pagination';
import { PaginationControls } from '@/components/PaginationControls';
import { createPaginatedQuery } from '@/lib/utils';
import { inventoryApi } from '@/lib/inventoryApi';
import { useAuth } from '@/lib/auth';

const HodDashboard = () => {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [departmentName, setDepartmentName] = useState<string | null>(null);
  const { toast } = useToast();

  const {
    pagination,
    setPage,
    setPageSize,
    setTotal,
  } = usePagination(10, 1);

  const { departmentId } = useAuth();
  const { primaryRole } = useAuth();
  const [searchInput, setSearchInput] = useState<string>('');
  const [filters, setFilters] = useState({ search: '' });
  const [metrics, setMetrics] = useState({ pending: 0, inProgress: 0, approved: 0, rejected: 0 });
  const [viewTicket, setViewTicket] = useState<any | null>(null);
  const [viewUpdates, setViewUpdates] = useState<any[]>([]);
  const navigate = useNavigate();

  const fetchDepartmentForUser = useCallback(async () => {
    try {
      // departmentId comes from Auth context; fallback to DB lookup if missing
      if (departmentId) {
        const { data: dept } = await supabase.from('departments').select('name').eq('id', departmentId).maybeSingle();
        setDepartmentName((dept as any)?.name ?? null);
        return;
      }

  

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: roleData, error: roleErr } = await supabase
        .from('user_roles')
        .select('department_id')
        .eq('user_id', user.id)
        .eq('role', 'hod')
        .maybeSingle();
      if (roleErr) throw roleErr;
      const deptId = (roleData as any)?.department_id;
      if (!deptId) {
        setDepartmentName(null);
        return;
      }
      const { data: dept } = await supabase.from('departments').select('name').eq('id', deptId).maybeSingle();
      setDepartmentName((dept as any)?.name ?? null);
    } catch (err) {
      console.error('Failed to fetch HOD department', err);
      toast({ title: 'Error', description: 'Failed to load HOD department', variant: 'destructive' });
    }
  }, [toast, departmentId]);

  // Inventory pagination + state for HOD's department
  const { pagination: invPagination, setPage: setInvPage, setPageSize: setInvPageSize, setTotal: setInvTotal } = usePagination(8, 1);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    try {
      if (!departmentName) {
        setTickets([]);
        setTotal(0);
        return;
      }

      let query: any = supabase
        .from('tickets')
        .select('*', { count: 'exact' })
        .eq('department', departmentName)
        .order('created_at', { ascending: false });

      if (filters.search) {
        const esc = String(filters.search || '').trim().replace(/%/g, '\\%').replace(/,/g, '');
        if (esc !== '') query = query.or(`ticket_number.ilike.%${esc}%,name.ilike.%${esc}%`);
      }

      query = createPaginatedQuery(query, pagination.page, pagination.pageSize);
      const { data, error, count } = await query;
      if (error) throw error;
      const enriched = (data || []).map((t: any) => computeSLAForTicket(t));
      setTickets(enriched);
      setTotal(count || 0);
    } catch (err) {
      console.error('Error fetching HOD tickets', err);
      toast({ title: 'Error', description: 'Failed to load tickets for your department', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [departmentName, filters, pagination.page, pagination.pageSize, setTotal, toast]);

  const fetchMetrics = useCallback(async () => {
    try {
      if (!departmentName) return;
      const [pendingRes, inProgRes, approvedRes, rejectedRes] = await Promise.all([
        supabase.from('tickets').select('id', { head: true, count: 'exact' }).eq('department', departmentName).eq('status', 'pending_principal'),
        supabase.from('tickets').select('id', { head: true, count: 'exact' }).eq('department', departmentName).eq('status', 'in-progress'),
        supabase.from('tickets').select('id', { head: true, count: 'exact' }).eq('department', departmentName).eq('status', 'procure-approved'),
        supabase.from('tickets').select('id', { head: true, count: 'exact' }).eq('department', departmentName).eq('status', 'procure-rejected'),
      ]);
      setMetrics({ pending: pendingRes.count || 0, inProgress: inProgRes.count || 0, approved: approvedRes.count || 0, rejected: rejectedRes.count || 0 });
    } catch (e) {
      console.error('fetchMetrics failed', e);
    }
  }, [departmentName]);

  const fetchInventory = useCallback(async () => {
    setLoadingInventory(true);
    try {
      if (!departmentName) {
        setInventoryItems([]);
        setInvTotal(0);
        return;
      }

      const limit = invPagination.pageSize;
      const offset = (invPagination.page - 1) * invPagination.pageSize;
      const { data, count } = await inventoryApi.getInventoryItems({ limit, offset, departmentId: departmentName });
      setInventoryItems(data || []);
      setInvTotal(count || 0);
    } catch (err) {
      console.error('Failed to fetch inventory for HOD', err);
      toast({ title: 'Error', description: 'Failed to load inventory for your department', variant: 'destructive' });
    } finally {
      setLoadingInventory(false);
    }
  }, [departmentName, invPagination.page, invPagination.pageSize, setInvTotal, toast]);

  const computeSLAForTicket = (ticket: any) => {
    try {
      const now = new Date();
      const rule = { high: { respondHours: 1, resolveHours: 8 }, medium: { respondHours: 4, resolveHours: 48 }, low: { respondHours: 24, resolveHours: 168 } }[ticket.priority as 'high' | 'medium' | 'low'] || { respondHours: 24, resolveHours: 168 };
      const created = new Date(ticket.created_at);
      const respondBy = new Date(created.getTime() + rule.respondHours * 60 * 60 * 1000);
      const respondDiff = now.getTime() - respondBy.getTime();
      ticket.sla = { respondByDisplay: respondBy.toISOString(), respondDaysOver: respondDiff > 0 ? Math.floor(respondDiff / (1000 * 60 * 60 * 24)) : 0 };
    } catch (e) { console.warn(e); }
    return ticket;
  };

  const formatProcureDescription = (description: string) => {
    const lines = String(description || '').split('\n').filter(l => l.trim());
    const data: Record<string,string> = {};
    lines.forEach(line => {
      const i = line.indexOf(':');
      if (i > -1) {
        const k = line.substring(0,i).trim();
        const v = line.substring(i+1).trim();
        data[k] = v;
      }
    });
    return data;
  };

  const openView = async (ticket: any) => {
    try {
      setViewTicket(ticket);
      const { data: updates, error } = await supabase.from('ticket_updates').select('*').eq('ticket_id', ticket.id).order('created_at', { ascending: false });
      if (error) throw error;
      setViewUpdates(updates || []);
    } catch (e) {
      console.error('Failed to load updates', e);
      setViewUpdates([]);
    }
  };
  useEffect(() => {
    if (departmentName) fetchInventory();
  }, [departmentName, fetchInventory]);

  const getPriorityColor = (priority: string) => {
    switch (String(priority)) {
      case 'low': return 'bg-yellow-100 text-yellow-800';
      case 'medium': return 'bg-orange-100 text-orange-800';
      case 'high': return 'bg-red-100 text-red-800';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusColor = (status: string) => {
    switch (String(status)) {
      case 'procure-approved': return 'bg-emerald-100 text-emerald-800';
      case 'procure-rejected': return 'bg-rose-100 text-rose-800';
      case 'service-approved': return 'bg-emerald-100 text-emerald-800';
      case 'service-rejected': return 'bg-rose-100 text-rose-800';
      case 'in-progress': return 'bg-sky-100 text-sky-800';
      case 'pending_principal': return 'bg-yellow-100 text-yellow-800';
      case 'resolved': return 'bg-emerald-100 text-emerald-800';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  useEffect(() => {
    // redirect if user is not HOD
    if (primaryRole !== 'hod') {
      navigate({ to: '/' });
      return;
    }
    fetchDepartmentForUser();
  }, [fetchDepartmentForUser]);

  useEffect(() => {
    if (departmentName) {
      fetchTickets();
      fetchMetrics();
    }
  }, [departmentName, fetchTickets]);

  useEffect(() => {
    const iv = setInterval(() => { if (departmentName) { fetchMetrics(); fetchTickets(); } }, 30000);
    return () => clearInterval(iv);
  }, [departmentName, fetchMetrics, fetchTickets]);

  if (loading) return (
    <Layout>
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
      </div>
    </Layout>
  );

  return (
    <Layout>
      <div className="container mx-auto py-6 px-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5 text-emerald-600" /> HOD Dashboard</CardTitle>
                <p className="text-sm text-muted-foreground">Tickets and stats for {departmentName || 'your department'}</p>
              </div>
              <div className="flex items-center gap-2">
                <Input placeholder="Search ticket # or requester" value={searchInput} onChange={(e) => setSearchInput((e.target as HTMLInputElement).value)} />
                <Button size="sm" onClick={() => { setPage(1); setFilters((p) => ({ ...p, search: searchInput })); }}>Apply</Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full table-fixed">
                <colgroup>
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '12%' }} />
                </colgroup>
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Ticket #</th>
                    <th className="px-3 py-2 text-left">Subject</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Priority</th>
                    <th className="px-3 py-2 text-left">SLA</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map(t => (
                    <tr key={t.id} className="border-t">
                      <td className="px-3 py-2 align-middle"><div className="font-mono">{t.ticket_number}</div></td>
                      <td className="px-3 py-2 align-middle"><div className="truncate max-w-full">{t.issue_category}</div></td>
                      <td className="px-3 py-2 align-middle"><Badge className={getStatusColor(t.status)}>{String(t.status || '').replace('-', ' ').toUpperCase()}</Badge></td>
                      <td className="px-3 py-2 align-middle"><Badge className={getPriorityColor(t.priority)}>{String(t.priority || '').charAt(0).toUpperCase() + String(t.priority || '').slice(1)}</Badge></td>
                      <td className="px-3 py-2 align-middle">{t.sla?.respondDaysOver ? (<Badge className="bg-rose-100 text-rose-800">{`${t.sla.respondDaysOver}d overdue`}</Badge>) : (<span className="text-sm text-muted-foreground">{t.sla?.respondByDisplay}</span>)}</td>
                      <td className="px-3 py-2 align-middle text-right"><Button size="sm" onClick={() => openView(t)}>View</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
        <div className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Activity className="w-5 h-5 text-emerald-600" /> Inventory</CardTitle>
                  <p className="text-sm text-muted-foreground">Items for {departmentName || 'your department'}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingInventory ? (
                <div className="flex items-center justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full table-fixed">
                    <colgroup>
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '30%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '14%' }} />
                      <col style={{ width: '18%' }} />
                      <col style={{ width: '10%' }} />
                    </colgroup>
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-2 py-2 text-left">Item Code</th>
                        <th className="px-2 py-2 text-left">Name</th>
                        <th className="px-2 py-2 text-left">Category</th>
                        <th className="px-2 py-2 text-left">Department</th>
                        <th className="px-2 py-2 text-left">Location</th>
                        <th className="px-2 py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inventoryItems.map(it => (
                        <tr key={it.id} className="border-t">
                          <td className="px-2 py-2 align-middle"><div className="truncate max-w-full">{it.item_code}</div></td>
                          <td className="px-2 py-2 align-middle"><div className="truncate max-w-full">{it.item_name}</div></td>
                          <td className="px-2 py-2 align-middle"><div className="truncate max-w-full">{(it.categories && it.categories.name) || it.category_name || '-'}</div></td>
                          <td className="px-2 py-2 align-middle"><div className="truncate max-w-full">{it.department || '-'}</div></td>
                          <td className="px-2 py-2 align-middle"><div className="truncate max-w-full">{(it.locations && it.locations.name) || it.location_name || '-'}</div></td>
                          <td className="px-2 py-2 align-middle text-right"><Button size="sm" onClick={() => navigate({ to: `/hod/inventory/${it.id}`, state: { from: 'hod-dashboard' } as any })}>View</Button></td>
                        </tr>
                      ))}
                      {inventoryItems.length === 0 && (
                        <tr><td colSpan={6} className="px-2 py-6 text-center text-sm text-muted-foreground">No inventory items found for your department.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-4">
                <PaginationControls
                  currentPage={invPagination.page}
                  totalPages={Math.max(1, Math.ceil(invPagination.total / invPagination.pageSize))}
                  pageSize={invPagination.pageSize}
                  totalItems={invPagination.total}
                  onPageChange={setInvPage}
                  onPageSizeChange={setInvPageSize}
                />
              </div>
            </CardContent>
          </Card>
        </div>
        {/* Detail dialog */}
        <Dialog open={!!viewTicket} onOpenChange={(open) => { if (!open) setViewTicket(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ticket Details</DialogTitle>
              <DialogDescription>Full details</DialogDescription>
            </DialogHeader>
            {viewTicket ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Ticket #</div>
                    <div className="font-medium">{viewTicket.ticket_number}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Status</div>
                    <div className="flex justify-end"><Badge className={getStatusColor(viewTicket.status)}>{String(viewTicket.status || '').replace('-', ' ').toUpperCase()}</Badge></div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Priority</div>
                    <div className="mt-1"><Badge className={getPriorityColor(viewTicket.priority)}>{String(viewTicket.priority || '')}</Badge></div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Created</div>
                    <div className="mt-1">{new Date(viewTicket.created_at).toLocaleString()}</div>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted-foreground">Details</div>
                  <div className="mt-1 whitespace-pre-wrap">{viewTicket.issue_description}</div>
                </div>

                {viewTicket.issue_category === 'procure' && (
                  <div>
                    <div className="text-xs text-muted-foreground">Procure Details</div>
                    <div className="mt-1">
                      {Object.entries(formatProcureDescription(viewTicket.issue_description)).map(([k,v]) => (
                        <div key={k} className="flex gap-2">
                          <div className="text-sm font-medium w-40">{k}</div>
                          <div className="text-sm text-muted-foreground">{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <div className="text-xs text-muted-foreground">Admin Updates</div>
                  <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                    {viewUpdates.length === 0 ? (<div className="text-sm text-muted-foreground">No updates yet.</div>) : (
                      viewUpdates.map(u => (
                        <div key={u.id} className="p-2 border rounded">
                          <div className="text-sm font-medium">{u.updated_by || 'System'}</div>
                          <div className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleString()}</div>
                          <div className="mt-1 whitespace-pre-wrap">{u.notes || u.description || u.admin_notes}</div>
                          {u.status_to ? (<div className="mt-1"><Badge className={getStatusColor(u.status_to)}>{String(u.status_to).replace('-', ' ').toUpperCase()}</Badge></div>) : null}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => setViewTicket(null)}>Close</Button>
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

export default HodDashboard;
