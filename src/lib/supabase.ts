import { supabase } from "@/integrations/supabase/client";
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
  const [categoryResult, locationResult, inventoryResult] = await Promise.all([
    supabase.from('categories').select('prefix').eq('id', categoryId).single(),
    supabase.from('locations').select('prefix, name').eq('id', locationId).single(),
    supabase.from('inventory')
      .select('item_code')
      .like('item_code', `%`)
      .order('created_at', { ascending: false })
      .limit(1)
  ]);

  if (categoryResult.error || locationResult.error) {
    throw new Error('Failed to fetch category or location data');
  }

  const categoryPrefix = categoryResult.data.prefix;
  const locationPrefix = locationResult.data.prefix;
  const locationName = locationResult.data.name || '';
  // Build code in format: College (constant) Block(locationCode) Item(categoryPrefix) YY / NNN
  const COLLEGE_CODE = 'AMC';

  // Year: last two digits of current year
  const yearTwo = new Date().getFullYear().toString().slice(-2);

  // Apply special location naming rules requested by admin:
  // - Engineering locations should use code 'EC'
  // - Degree college locations should use code 'DC'
  // - Admin block should have an underscore prefix: '_AB'
  let locationCode = locationPrefix;
  const lname = locationName.toLowerCase();
  if (lname.includes('engineering')) locationCode = 'EC';
  else if (lname.includes('degree')) locationCode = 'DC';
  else if (lname.includes('admin')) {
    // Admin block should use plain 'AB' code (no underscore)
    locationCode = 'AB';
  }

  // Base prefix to search existing entries for this location+category+year (no hyphens)
  // Include optional department prefix between locationCode and yearTwo when provided
  const deptPart = departmentPrefix ? String(departmentPrefix) : '';
  const basePrefix = `${COLLEGE_CODE}${locationCode}${deptPart}${yearTwo}${categoryPrefix}`;

  // Query inventory for codes starting with basePrefix, get the highest serial
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
    const lastCode: string = existing[0].item_code;
    // Extract all numeric digits at the end of the code (not just last 3 characters)
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
    // Generate QR code with URL to item details page
    const itemUrl = `${window.location.origin}/inventory/${itemId || itemCode}`;
    const qrCodeDataURL = await QRCode.toDataURL(itemUrl, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    // Create a combined image: QR on top, item code text below, so downloads include the code
    const img = new Image();
    img.src = qrCodeDataURL;
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = (e) => rej(e);
    });

    // Canvas layout
    const qrWidth = img.width;
    const qrHeight = img.height;
    const padding = 16;
    const textFont = '20px sans-serif';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');

    // compute text height roughly from font size
    const textSize = 24;
    canvas.width = qrWidth;
    canvas.height = qrHeight + padding + textSize + padding;

    // background white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // draw QR
    ctx.drawImage(img, 0, 0, qrWidth, qrHeight);

    // draw item code centered below
    ctx.fillStyle = '#000000';
    ctx.font = textFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const textX = canvas.width / 2;
    const textY = qrHeight + padding;
    ctx.fillText(itemCode, textX, textY);

    // convert canvas to blob and upload
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Failed to create QR image');
    const file = new File([blob], `${itemCode}-qrcode.png`, { type: 'image/png' });
    return await uploadImage(file, 'qr-codes');
  } catch (error) {
    console.error('Error generating QR code:', error);
    return null;
  }
};
