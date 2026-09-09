import { supabase } from '@/integrations/supabase/client';

export const inventoryApi = {
  // Inventory Items
  async getInventoryItems({ limit = 20, offset = 0, search = '', status = 'all', categoryId = 'all', locationId = 'all', departmentId = 'all' }: {
    limit?: number;
    offset?: number;
    search?: string;
    status?: string;
    categoryId?: string;
    locationId?: string;
    departmentId?: string;
  } = {}) {
    try {
      // Build data query with filters and pagination
      let dataQuery: any = supabase
        .from('inventory')
        .select(`
          *,
          categories(name),
          locations(name, prefix)
        `, { count: 'exact' })
        .order('item_code');

      if (search) {
        dataQuery = dataQuery.or(`item_code.ilike.%${search}%,item_name.ilike.%${search}%,department.ilike.%${search}%`);
      }
      if (status !== 'all') dataQuery = dataQuery.eq('status', status);
      if (categoryId !== 'all') dataQuery = dataQuery.eq('category_id', categoryId);
      if (locationId !== 'all') dataQuery = dataQuery.eq('location_id', locationId);
      if (departmentId !== 'all') dataQuery = dataQuery.eq('department', departmentId);

      const { data, error, count } = await dataQuery.range(offset, offset + limit - 1);
      if (error) throw error;

      // Ensure we have a total count; if Supabase didn't return it, run a head count query
      let finalCount = count;
      if (finalCount === null || finalCount === undefined) {
        try {
          let countQuery: any = supabase.from('inventory').select('id', { count: 'exact', head: true });
          if (search) countQuery = countQuery.or(`item_code.ilike.%${search}%,item_name.ilike.%${search}%,department.ilike.%${search}%`);
          if (status !== 'all') countQuery = countQuery.eq('status', status);
          if (categoryId !== 'all') countQuery = countQuery.eq('category_id', categoryId);
          if (locationId !== 'all') countQuery = countQuery.eq('location_id', locationId);
          if (departmentId !== 'all') countQuery = countQuery.eq('department', departmentId);

          // Destructure count from the head query response to ensure we pick up the
          // exact total even when the main paginated query doesn't return it
          const { count: headCount } = await countQuery;
          const parsed = Number(headCount);
          finalCount = Number.isFinite(parsed) && parsed >= 0 ? parsed : (data || []).length;
        } catch (e) {
          finalCount = (data || []).length;
        }
      }

      return { data: data || [], count: finalCount || 0 };
    } catch (error) {
      console.error('Failed to fetch inventory items:', error);
      return { data: [], count: 0 };
    }
  },

  async getInventoryItem(id: string) {
    try {
      const itemQuery = supabase
        .from('inventory')
        .select(`
          *,
          categories(name, prefix),
          locations(name, prefix, building)
        `)
        .eq('id', id)
        .single();

      const historyQuery = supabase
        .from('inventory_history')
        .select('*')
        .eq('inventory_id', id)
        .order('created_at', { ascending: false });

      const [{ data: itemData, error: itemError }, { data: historyData, error: historyError }] = await Promise.all([itemQuery, historyQuery]);

      if (itemError) throw itemError;
      if (historyError) {
        console.error('Failed to fetch inventory history:', historyError);
      }

      return { ...itemData, inventory_history: historyData || [] };
    } catch (error) {
      console.error('Failed to fetch inventory item:', error);
      return null;
    }
  },

  async createInventoryItem(item: any) {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .insert(item)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Failed to create inventory item:', error);
      throw error;
    }
  },

  async updateInventoryItem(id: string, updates: any) {
    try {
      const { data, error } = await supabase
        .from('inventory')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Failed to update inventory item:', error);
      throw error;
    }
  },

  async deleteInventoryItem(id: string) {
    try {
      const { error } = await supabase
        .from('inventory')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Failed to delete inventory item:', error);
      throw error;
    }
  },

  // Categories
  async getCategories() {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      return [];
    }
  },

  // Get distinct category names that appear in inventory for a specific department.
  // Returns an array of { value: string, label: string } where value and label are the category name.
  async getCategoriesForDepartment(departmentName?: string) {
    try {
      let query: any = supabase
        .from('inventory')
        .select('category_id, categories(name)');

      if (departmentName) {
        query = query.eq('department', departmentName);
      }

      const { data, error } = await query;
      if (error) throw error;

      const map = new Map<string, { value: string; label: string }>();
      (data || []).forEach((row: any) => {
        const name = (row.categories && row.categories.name) || null;
        if (name && !map.has(name)) {
          map.set(name, { value: name, label: name });
        }
      });

      return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
    } catch (error) {
      console.error('Failed to fetch department categories from inventory:', error);
      return [];
    }
  },

  // Locations
  async getLocations() {
    try {
      const { data, error } = await supabase
        .from('locations')
        .select('*')
        .order('name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Failed to fetch locations:', error);
      return [];
    }
  },

  // Quotations
  async getQuotations({ limit = 20, offset = 0, status = 'all' }: { limit?: number; offset?: number; status?: string } = {}) {
    try {
      let query = supabase
        .from('quotations')
        .select(`
          *,
          categories(name)
        `, { count: 'exact' });

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return { data: data || [], count: count || 0 };
    } catch (error) {
      console.error('Failed to fetch quotations:', error);
      return { data: [], count: 0 };
    }
  },

  async createQuotation(quotation: any) {
    try {
      const { data, error } = await supabase
        .from('quotations')
        .insert(quotation)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Failed to create quotation:', error);
      throw error;
    }
  },

  // Tickets
  async getTickets({ limit = 20, offset = 0, status = 'all', priority = 'all' }: {
    limit?: number;
    offset?: number;
    status?: string;
    priority?: string;
  } = {}) {
    try {
      let query = supabase
        .from('tickets')
        .select('*', { count: 'exact' });

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      if (priority !== 'all') {
        query = query.eq('priority', priority);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return { data: data || [], count: count || 0 };
    } catch (error) {
      console.error('Failed to fetch tickets:', error);
      return { data: [], count: 0 };
    }
  },

  async createTicket(ticket: any) {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .insert(ticket)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Failed to create ticket:', error);
      throw error;
    }
  },

  async updateTicket(id: string, updates: any) {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Failed to update ticket:', error);
      throw error;
    }
  },
};