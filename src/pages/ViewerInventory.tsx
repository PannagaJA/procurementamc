import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import Layout from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { usePagination } from '@/hooks/use-pagination';
import { PaginationControls } from '@/components/PaginationControls';
import { inventoryApi } from '@/lib/inventoryApi';
import { useAuth } from '@/lib/auth';

const ViewerInventory = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { primaryRole } = useAuth();

  const [departmentName, setDepartmentName] = useState<string | null>(null);
  const { pagination, setPage, setPageSize, setTotal } = usePagination(12, 1);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const limit = pagination.pageSize;
      const offset = (pagination.page - 1) * pagination.pageSize;
      const { data, count } = await inventoryApi.getInventoryItems({ limit, offset });
      setItems(data || []);
      setTotal(count || 0);
    } catch (err) {
      console.error('Failed to fetch inventory items', err);
      toast({ title: 'Error', description: 'Failed to load inventory', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.pageSize, setTotal, toast]);

  useEffect(() => { if (primaryRole !== 'viewer') navigate({ to: '/' }); }, [primaryRole, navigate]);
  useEffect(() => { fetchItems(); }, [fetchItems]);

  return (
    <Layout>
      <div className="container mx-auto py-6 px-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-semibold">Viewer Inventory</CardTitle>
                <p className="text-sm text-muted-foreground">Read-only inventory listing</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
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
                  {items.map(it => (
                    <tr key={it.id} className="border-t">
                      <td className="px-2 py-2 align-middle"><div className="truncate max-w-full">{it.item_code}</div></td>
                      <td className="px-2 py-2 align-middle"><div className="truncate max-w-full">{it.item_name}</div></td>
                      <td className="px-2 py-2 align-middle">{(it.categories && it.categories.name) || it.category_name || '-'}</td>
                      <td className="px-2 py-2 align-middle">{it.department || '-'}</td>
                      <td className="px-2 py-2 align-middle">{(it.locations && it.locations.name) || it.location_name || '-'}</td>
                      <td className="px-2 py-2 align-middle text-right"><Button size="sm" onClick={() => navigate({ to: `/viewer/inventory/${it.id}`, state: { from: 'viewer-inventory' } })}>View</Button></td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr><td colSpan={6} className="px-2 py-6 text-center text-sm text-muted-foreground">No inventory items found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-4">
              <PaginationControls
                currentPage={pagination.page}
                totalPages={Math.max(1, Math.ceil(pagination.total / pagination.pageSize))}
                pageSize={pagination.pageSize}
                totalItems={pagination.total}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default ViewerInventory;
