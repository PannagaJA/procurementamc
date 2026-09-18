import { supabase } from '@/integrations/supabase/client';
import QRCode from 'qrcode';

export const uploadImage = async (file: File, bucket: string = 'inventory-images'): Promise<string | null> => {
  const fileExt = file.name.split('.').pop();
  const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
  const filePath = `${fileName}`;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file);

  if (error) {
    console.error('Upload error:', error);
    return null;
  }

  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(filePath);

  return data.publicUrl;
};

export const generateItemCode = async (
  categoryId: string,
  locationId: string,
  quantity: number = 1,
  departmentPrefix?: string | null
): Promise<string[]> => {
  // Fetch category and location prefixes
  const [categoryResult, locationResult] = await Promise.all([
    supabase.from('categories').select('prefix').eq('id', categoryId).single(),
    supabase.from('locations').select('prefix, name').eq('id', locationId).single(),
  ]);

  if (categoryResult.error || locationResult.error) {
    throw new Error('Failed to fetch category or location data');
  }

  const categoryPrefix = categoryResult.data.prefix;
  const locationPrefix = locationResult.data.prefix;
  const locationName = locationResult.data.name || '';
  const COLLEGE_CODE = 'AMC';

  const yearTwo = new Date().getFullYear().toString().slice(-2);

  let locationCode = locationPrefix;
  const lname = locationName.toLowerCase();
  if (lname.includes('engineering')) locationCode = 'EC';
  else if (lname.includes('degree')) locationCode = 'DC';
  else if (lname.includes('admin')) {
    locationCode = 'AB';
  }

  const deptPart = departmentPrefix ? String(departmentPrefix) : '';
  const basePrefix = `${COLLEGE_CODE}${locationCode}${deptPart}${yearTwo}${categoryPrefix}`;

  const { data: existing = [], error: invError } = await supabase
    .from('inventory')
    .select('item_code')
    .like('item_code', `${basePrefix}%`)
    .order('item_code', { ascending: false })
    .limit(1);

  if (invError) {
    console.error('Error fetching existing item codes for serial generation', invError);
  }

  let nextSerial = 1;
  if (existing && existing.length > 0) {
    const lastCode = existing[0].item_code || '';
    const serialMatch = lastCode.match(/(\d+)$/);
    const serialPart = serialMatch ? serialMatch[1] : '';
    const parsed = parseInt(serialPart || '0', 10);
    if (!isNaN(parsed)) nextSerial = parsed + 1;
  }

  const codes: string[] = [];
  for (let i = 0; i < quantity; i++) {
    const serialStr = (nextSerial + i).toString();
    const itemCode = `${basePrefix}${serialStr}`;
    codes.push(itemCode);
  }
  return codes;
};

export const generateQRCode = async (itemCode: string, itemId?: string): Promise<string | null> => {
  try {
    const itemUrl = `${window.location.origin}/inventory/${itemId || itemCode}`;
    const qrCodeDataURL = await QRCode.toDataURL(itemUrl, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    const img = new Image();
    img.src = qrCodeDataURL;
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = (e) => rej(e);
    });

    const qrWidth = img.width;
    const qrHeight = img.height;
    const padding = 16;
    const textFont = '20px sans-serif';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');

    const textSize = 24;
    canvas.width = qrWidth;
    canvas.height = qrHeight + padding + textSize + padding;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, qrWidth, qrHeight);

    ctx.fillStyle = '#000000';
    ctx.font = textFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const textX = canvas.width / 2;
    const textY = qrHeight + padding;
    ctx.fillText(itemCode, textX, textY);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Failed to create QR image');
    const file = new File([blob], `${itemCode}-qrcode.png`, { type: 'image/png' });
    return await uploadImage(file, 'qr-codes');
  } catch (error) {
    console.error('Error generating QR code:', error);
    return null;
  }
};

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