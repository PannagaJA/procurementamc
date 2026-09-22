import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const DEMO_PASSWORD = 'Password@123';

const USERS_LIST = [
  { email: 'admin@institution.edu', fullName: 'Dr. System Administrator', role: 'admin', deptCode: 'ADMIN' },
  { email: 'evp@institution.edu', fullName: 'Dr. Rajesh Sharma (EVP)', role: 'evp', deptCode: 'ADMIN' },
  { email: 'principal@institution.edu', fullName: 'Dr. Anand Kumar (Principal)', role: 'principal', deptCode: 'ADMIN' },
  { email: 'hod.cse@institution.edu', fullName: 'Prof. Vikram Seth (HOD CSE)', role: 'hod', deptCode: 'CSE' },
  { email: 'hod.mech@institution.edu', fullName: 'Prof. Ramesh Gupta (HOD MECH)', role: 'hod', deptCode: 'MECH' },
  { email: 'procurement.officer@institution.edu', fullName: 'Suresh Menon (Procurement Officer)', role: 'procurement_officer', deptCode: 'ADMIN' },
  { email: 'purchase.committee@institution.edu', fullName: 'Prof. Sunita Rao (Purchase Committee Chair)', role: 'purchase_committee', deptCode: 'ADMIN' },
  { email: 'finance@institution.edu', fullName: 'Priya Nambiar (Finance Officer)', role: 'finance', deptCode: 'ADMIN' },
  { email: 'stores@institution.edu', fullName: 'Manoj Kumar (Central Stores Keeper)', role: 'stores', deptCode: 'ADMIN' },
  { email: 'faculty.cse@institution.edu', fullName: 'Dr. Ananya Roy (Faculty Requisitioner)', role: 'user', deptCode: 'CSE' },
  { email: 'librarian@institution.edu', fullName: 'Kavita Joshi (Chief Librarian)', role: 'librarian', deptCode: 'ADMIN' }
];

async function runPopulation() {
  console.log('===============================================================');
  console.log('🏢 POPULATING COMPLETE INSTITUTIONAL DATA ACROSS ALL ROLES & PAGES');
  console.log('===============================================================\n');

  // 1. Departments
  console.log('1. Setting up Departments...');
  const depts = [
    { name: 'Computer Science & Engineering', prefix: 'CSE' },
    { name: 'Electrical & Electronics Engineering', prefix: 'EEE' },
    { name: 'Mechanical Engineering', prefix: 'MECH' },
    { name: 'Civil Engineering', prefix: 'CIVIL' },
    { name: 'Central Administration & Stores', prefix: 'ADMIN' }
  ];

  const deptMap = {};
  for (const d of depts) {
    const { data: existing } = await supabase.from('departments').select('id, prefix').eq('prefix', d.prefix).maybeSingle();
    if (existing) {
      deptMap[d.prefix] = existing.id;
    } else {
      const { data: inserted, error } = await supabase.from('departments').insert([d]).select('id, prefix').single();
      if (error) console.error('Error creating department:', error.message);
      else deptMap[d.prefix] = inserted.id;
    }
  }
  console.log('✓ Departments:', Object.keys(deptMap).join(', '));

  // 2. Locations & Categories
  console.log('\n2. Setting up Locations & Categories...');
  const locs = [
    { name: 'Main Server Room (Room 101)', building: 'Academic Block A', prefix: 'SRV' },
    { name: 'CSE Advanced Computing Lab', building: 'Tech Block 2', prefix: 'CSE-LAB' },
    { name: 'Mechanical CAD/CAM Center', building: 'Workshop Wing', prefix: 'MECH-CAD' },
    { name: 'Central Stores Warehouse', building: 'Admin Annex', prefix: 'STR' },
    { name: 'Central Library First Floor', building: 'Library Complex', prefix: 'LIB' }
  ];
  const locMap = {};
  for (const l of locs) {
    const { data } = await supabase.from('locations').upsert(l, { onConflict: 'name' }).select('id, prefix').single();
    if (data) locMap[data.prefix] = data.id;
  }

  const cats = [
    { name: 'IT & Computing Hardware', prefix: 'IT' },
    { name: 'Lab Equipment & Instruments', prefix: 'LAB' },
    { name: 'Office Stationery & Consumables', prefix: 'STAT' },
    { name: 'Software & Licenses', prefix: 'SOFT' },
    { name: 'Furniture & Fixtures', prefix: 'FURN' }
  ];
  const catMap = {};
  for (const c of cats) {
    const { data } = await supabase.from('categories').upsert(c, { onConflict: 'name' }).select('id, prefix').single();
    if (data) catMap[data.prefix] = data.id;
  }
  console.log('✓ Locations & Categories synchronized.');

  // 3. Profiles & Auth Users
  console.log('\n3. Verifying User Profiles and Role Assignments...');
  const userMap = {};
  const { data: userList } = await supabase.auth.admin.listUsers();

  for (const u of USERS_LIST) {
    let authUser = userList?.users?.find((x) => x.email?.toLowerCase() === u.email.toLowerCase());

    if (!authUser) {
      const { data: newUser, error: authErr } = await supabase.auth.admin.createUser({
        email: u.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: u.fullName }
      });
      if (authErr) {
        console.error(`Failed to create ${u.email}:`, authErr.message);
        continue;
      }
      authUser = newUser.user;
    }

    userMap[u.email] = authUser.id;

    // Profiles
    await supabase.from('profiles').upsert({
      id: authUser.id,
      email: u.email,
      full_name: u.fullName,
      updated_at: new Date().toISOString()
    });

    // User Roles
    await supabase.from('user_roles').upsert({
      user_id: authUser.id,
      role: u.role,
      department_id: deptMap[u.deptCode] || null
    }, { onConflict: 'user_id,role' });
  }
  console.log('✓ All 11 institutional users verified.');

  // 4. Vendors (Vendor Master)
  console.log('\n4. Seeding Vendor Master...');
  const vendors = [
    {
      name: 'Apex Tech Solutions Pvt Ltd',
      registered_address: '42 Tech Park, Outer Ring Road, Bangalore - 560103',
      gst_number: '29ABCDE1234F1Z5',
      pan_number: 'ABCDE1234F',
      status: 'empanelled',
      empanelled_on: '2025-10-01',
      empanelment_expiry: '2028-10-01',
      bank_details_json: { bank: 'HDFC Bank', ac_no: '50100987654321', ifsc: 'HDFC0001234' }
    },
    {
      name: 'Dell Technologies India',
      registered_address: 'Divyasree Greens, Ground Floor, Bangalore - 560071',
      gst_number: '29AABCD5678G1Z9',
      pan_number: 'AABCD5678G',
      status: 'empanelled',
      empanelled_on: '2025-10-01',
      empanelment_expiry: '2028-10-01',
      bank_details_json: { bank: 'Citibank', ac_no: '1122334455', ifsc: 'CITI0000002' }
    },
    {
      name: 'Lenovo Enterprise Solutions',
      registered_address: 'Embassy TechVillage, Bellandur, Bangalore - 560103',
      gst_number: '29BBBBB9999K1ZQ',
      pan_number: 'BBBBB9999K',
      status: 'empanelled',
      empanelled_on: '2025-10-01',
      empanelment_expiry: '2028-10-01',
      bank_details_json: { bank: 'Standard Chartered', ac_no: '9988776655', ifsc: 'SCBL0036001' }
    },
    {
      name: 'Prime Office Supplies & Stationery',
      registered_address: '14 Commercial Street, Bangalore - 560001',
      gst_number: '29CCCCC1111L1ZX',
      pan_number: 'CCCCC1111L',
      status: 'empanelled',
      empanelled_on: '2025-11-15',
      empanelment_expiry: '2028-11-15',
      bank_details_json: { bank: 'State Bank of India', ac_no: '33445566778', ifsc: 'SBIN0000531' }
    },
    {
      name: 'Precision Lab Instruments Corp',
      registered_address: '88 Industrial Suburb, Peenya 1st Stage, Bangalore - 560058',
      gst_number: '29DDDDD5555M1ZA',
      pan_number: 'DDDDD5555M',
      status: 'empanelled',
      empanelled_on: '2025-09-01',
      empanelment_expiry: '2028-09-01',
      bank_details_json: { bank: 'Canara Bank', ac_no: '0412201004567', ifsc: 'CNRB0000412' }
    },
    {
      name: 'Substandard Facilities & Maintenance',
      registered_address: '99 Industrial Area, Peenya, Bangalore - 560058',
      gst_number: '29EEEEE2222M1ZY',
      pan_number: 'EEEEE2222M',
      status: 'debarred',
      empanelled_on: '2025-08-01',
      empanelment_expiry: '2026-08-01',
      bank_details_json: { bank: 'Axis Bank', ac_no: '918020011223344', ifsc: 'UTIB0000004' }
    }
  ];

  const vendorMap = {};
  for (const v of vendors) {
    const { data: existing } = await supabase.from('vendors').select('id, name').eq('name', v.name).maybeSingle();
    if (existing) {
      vendorMap[v.name] = existing.id;
    } else {
      const { data: inserted, error } = await supabase.from('vendors').insert([v]).select('id, name').single();
      if (error) console.error('Vendor insert err:', v.name, error.message);
      else vendorMap[v.name] = inserted.id;
    }
  }
  console.log('✓ Vendors loaded:', Object.keys(vendorMap).length);

  // 5. Purchase Requisitions (PRs)
  console.log('\n5. Creating Realistic Purchase Requisitions across Matrix Roles...');
  const facultyId = userMap['faculty.cse@institution.edu'];
  const hodCseId = userMap['hod.cse@institution.edu'];
  const hodMechId = userMap['hod.mech@institution.edu'];
  const principalId = userMap['principal@institution.edu'];
  const evpId = userMap['evp@institution.edu'];
  const pcId = userMap['purchase.committee@institution.edu'];
  const procOfficerId = userMap['procurement.officer@institution.edu'];
  const storesId = userMap['stores@institution.edu'];
  const financeId = userMap['finance@institution.edu'];

  // Clear existing PRs if any to re-populate cleanly
  await supabase.from('purchase_requisitions').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // PR 1: CSE High-Performance AI Workstations (₹12,00,000, Approved by EVP)
  const { data: pr1 } = await supabase.from('purchase_requisitions').insert([{
    pr_number: 'PR-2026-0001',
    department_id: deptMap['CSE'],
    requested_by: facultyId,
    category: 'equipment_asset',
    scope: 'academic',
    status: 'approved',
    budget_head: 'CapEx - AI Research Laboratory Modernization',
    estimated_value: 1200000,
    justification: 'Procurement of 10x High-Performance GPU Workstations for M.Tech & PhD AI Research Compute cluster.',
    market_survey_notes: 'Empanelled OEM pricing obtained from Dell, Lenovo, and Apex Tech.'
  }]).select().single();

  if (pr1) {
    await supabase.from('pr_line_items').insert([{
      pr_id: pr1.id,
      description: 'Intel Xeon AI Workstation (64GB DDR5, RTX 4080 16GB, 2TB NVMe, 27" 4K)',
      unit: 'units',
      qty_required: 10,
      qty_in_stock: 0,
      net_qty_to_procure: 10,
      est_unit_price: 120000,
      est_total: 1200000
    }]);

    await supabase.from('pr_approvals').insert([
      { pr_id: pr1.id, approver_id: hodCseId, approver_role: 'hod', status: 'approved', comments: 'Recommended. Needed for AI Lab expansion.' },
      { pr_id: pr1.id, approver_id: principalId, approver_role: 'principal', status: 'approved', comments: 'Concurred and forwarded for Capital Budget release.' },
      { pr_id: pr1.id, approver_id: evpId, approver_role: 'evp', status: 'approved', comments: 'Approved within Annual Capital Expenditure Allocation.' }
    ]);
  }

  // PR 2: Smart Interactive Displays (₹2,50,000, Pending Principal Review in "My Approvals")
  const { data: pr2 } = await supabase.from('purchase_requisitions').insert([{
    pr_number: 'PR-2026-0002',
    department_id: deptMap['CSE'],
    requested_by: facultyId,
    category: 'equipment_asset',
    scope: 'academic',
    status: 'submitted',
    budget_head: 'OpEx - Smart Classroom Tech Upgrade',
    estimated_value: 250000,
    current_approver_role: 'principal',
    justification: 'Replacement of defective optical projectors with 75-inch Interactive 4K Touch Panels in Seminar Hall.',
    market_survey_notes: 'Budget estimate based on prevailing GeM / empanelled rate card.'
  }]).select().single();

  if (pr2) {
    await supabase.from('pr_line_items').insert([{
      pr_id: pr2.id,
      description: '75-inch 4K UHD Interactive Flat Panel Display with Built-in Android & Windows OPS',
      unit: 'units',
      qty_required: 2,
      qty_in_stock: 0,
      net_qty_to_procure: 2,
      est_unit_price: 125000,
      est_total: 250000
    }]);

    await supabase.from('pr_approvals').insert([
      { pr_id: pr2.id, approver_id: hodCseId, approver_role: 'hod', status: 'approved', comments: 'Verified Seminar Hall requirements. Forwarded to Principal for financial sanction.' }
    ]);
  }

  // PR 3: Campus MATLAB & Simulink Licenses (₹8,00,000, Pending Purchase Committee in "My Approvals")
  const { data: pr3 } = await supabase.from('purchase_requisitions').insert([{
    pr_number: 'PR-2026-0003',
    department_id: deptMap['ADMIN'],
    requested_by: procOfficerId,
    category: 'software',
    scope: 'academic',
    status: 'under_review',
    budget_head: 'CapEx - Institution-wide Software Licenses',
    estimated_value: 800000,
    current_approver_role: 'purchase_committee',
    justification: 'Annual renewal of Campus-Wide 500-user MATLAB, Simulink, and 45 companion toolboxes.',
    market_survey_notes: 'Sole proprietary academic distributor quote received.'
  }]).select().single();

  if (pr3) {
    await supabase.from('pr_line_items').insert([{
      pr_id: pr3.id,
      description: 'MATLAB & Simulink Campus-Wide Suite (500 Concurrent Seats, 1-Year Support)',
      unit: 'subscription',
      qty_required: 1,
      qty_in_stock: 0,
      net_qty_to_procure: 1,
      est_unit_price: 800000,
      est_total: 800000
    }]);
  }

  // PR 4: Mechanical Workshop Lathe & Milling Tooling (₹1,75,000, Pending HOD Approval)
  const { data: pr4 } = await supabase.from('purchase_requisitions').insert([{
    pr_number: 'PR-2026-0004',
    department_id: deptMap['MECH'],
    requested_by: facultyId,
    category: 'routine_consumable',
    scope: 'academic',
    status: 'submitted',
    budget_head: 'OpEx - Workshop Consumables',
    estimated_value: 175000,
    current_approver_role: 'hod',
    justification: 'High-speed carbide cutting tools and drill bits for 4th Semester Manufacturing Lab sessions.',
    market_survey_notes: 'Standard industrial specification items.'
  }]).select().single();

  if (pr4) {
    await supabase.from('pr_line_items').insert([{
      pr_id: pr4.id,
      description: 'Carbide Insert CNC End Mills and Turning Tooling Set (Assorted 50 pcs)',
      unit: 'sets',
      qty_required: 5,
      qty_in_stock: 1,
      net_qty_to_procure: 4,
      est_unit_price: 43750,
      est_total: 175000
    }]);
  }

  // PR 5: Office Paper & Stationery for Examination Cell (₹45,000, Approved)
  const { data: pr5 } = await supabase.from('purchase_requisitions').insert([{
    pr_number: 'PR-2026-0005',
    department_id: deptMap['ADMIN'],
    requested_by: procOfficerId,
    category: 'small_value',
    scope: 'operational',
    status: 'approved',
    budget_head: 'OpEx - Examination Stationery & Printing',
    estimated_value: 45000,
    justification: '75 GSM A4 Bond Paper Reams for End-Semester Question Papers & Answer Booklets.',
    market_survey_notes: 'Competitive rates from empanelled stationery vendor.'
  }]).select().single();

  if (pr5) {
    await supabase.from('pr_line_items').insert([{
      pr_id: pr5.id,
      description: 'JK Copier A4 Paper 75 GSM (Carton of 10 Reams)',
      unit: 'cartons',
      qty_required: 30,
      qty_in_stock: 5,
      net_qty_to_procure: 25,
      est_unit_price: 1800,
      est_total: 45000
    }]);

    await supabase.from('pr_approvals').insert([
      { pr_id: pr5.id, approver_id: hodCseId, approver_role: 'hod', status: 'approved', comments: 'Approved for urgent mid-term exams printing.' }
    ]);
  }

  console.log('✓ 5 Purchase Requisitions seeded with line items and approvals.');

  // 6. Solicitations (RFQs) & Quotations for PR-2026-0001
  console.log('\n6. Seeding RFQ Solicitations & Bids...');
  const { data: rfq1 } = await supabase.from('rfqs').insert([{
    rfq_number: 'RFQ-2026-0001',
    pr_id: pr1.id,
    required_min_quotations: 3,
    status: 'closed',
    response_deadline: new Date(Date.now() + 86400000 * 7).toISOString(),
    notes: 'Competitive solicitation for 10x AI GPU Workstations. Compliance with OEM warranty and on-site NBD support mandatory.',
    created_by: procOfficerId
  }]).select().single();

  if (rfq1) {
    const vApex = vendorMap['Apex Tech Solutions Pvt Ltd'];
    const vDell = vendorMap['Dell Technologies India'];
    const vLenovo = vendorMap['Lenovo Enterprise Solutions'];

    // RFQ Vendors mapping
    await supabase.from('rfq_vendors').insert([
      { rfq_id: rfq1.id, vendor_id: vApex, sent_at: new Date().toISOString(), response_received_at: new Date().toISOString() },
      { rfq_id: rfq1.id, vendor_id: vDell, sent_at: new Date().toISOString(), response_received_at: new Date().toISOString() },
      { rfq_id: rfq1.id, vendor_id: vLenovo, sent_at: new Date().toISOString(), response_received_at: new Date().toISOString() }
    ]);

    // Quotation Lines
    await supabase.from('quotation_lines').insert([
      {
        rfq_id: rfq1.id,
        vendor_id: vApex,
        description: 'Custom Intel Xeon AI Workstation (64GB DDR5, RTX 4080 16GB, 2TB Gen4, 27" 4K)',
        quantity: 10,
        unit: 'units',
        unit_price: 117500,
        tax_amount: 211500,
        total_price: 1175000,
        delivery_days: 14,
        warranty_months: 36,
        meets_technical_spec: true,
        technical_remarks: 'Fully compliant with 3-year comprehensive on-site warranty & NVIDIA AI Enterprise support.',
        quotation_ref: 'APEX/Q/2026/0942'
      },
      {
        rfq_id: rfq1.id,
        vendor_id: vDell,
        description: 'Dell Precision 5860 Tower Workstation (64GB ECC DDR5, RTX 4080 16GB, 2TB, 27" 4K)',
        quantity: 10,
        unit: 'units',
        unit_price: 122000,
        tax_amount: 219600,
        total_price: 1220000,
        delivery_days: 21,
        warranty_months: 36,
        meets_technical_spec: true,
        technical_remarks: 'Dell ProSupport 3-Yr Next Business Day included.',
        quotation_ref: 'DELL-BLR-2026-881'
      },
      {
        rfq_id: rfq1.id,
        vendor_id: vLenovo,
        description: 'Lenovo ThinkStation P5 (64GB DDR5, RTX 4080 16GB, 2TB SSD, 27" 4K)',
        quantity: 10,
        unit: 'units',
        unit_price: 124500,
        tax_amount: 224100,
        total_price: 1245000,
        delivery_days: 18,
        warranty_months: 36,
        meets_technical_spec: true,
        technical_remarks: 'Lenovo Premier Support with Keep Your Drive warranty.',
        quotation_ref: 'LEN-ENT-Q774'
      }
    ]);
  }
  console.log('✓ RFQ-2026-0001 with 3 vendor quotation bids seeded.');

  // 7. Comparative Statement (CS)
  console.log('\n7. Seeding Comparative Statement (CS)...');
  const vApex = vendorMap['Apex Tech Solutions Pvt Ltd'];
  const vDell = vendorMap['Dell Technologies India'];
  const vLenovo = vendorMap['Lenovo Enterprise Solutions'];

  const { data: cs1 } = await supabase.from('comparative_statements').insert([{
    cs_number: 'CS-2026-0001',
    rfq_id: rfq1.id,
    pr_id: pr1.id,
    prepared_by: procOfficerId,
    negotiation_notes: 'Vendor Apex Tech Solutions Pvt Ltd agreed to 2% prompt settlement discount and 36-month NBD on-site warranty.',
    price_reasonableness_notes: 'Lowest responsive bidder (L1). Unit rate of ₹1,17,500 is 2.1% lower than current institutional benchmark.',
    recommended_vendor_id: vApex,
    recommended_total: 1175000,
    is_lowest_price: true,
    status: 'approved',
    approved_by: evpId,
    approved_at: new Date().toISOString()
  }]).select().single();

  if (cs1) {
    await supabase.from('cs_line_scores').insert([
      { cs_id: cs1.id, vendor_id: vApex, quoted_total: 1175000, price_score: 95.0, technical_score: 96.0, delivery_score: 90.0, warranty_score: 95.0, total_score: 94.2, rank: 1, notes: 'L1 Bidder, fully compliant.' },
      { cs_id: cs1.id, vendor_id: vDell, quoted_total: 1220000, price_score: 88.0, technical_score: 98.0, delivery_score: 80.0, warranty_score: 95.0, total_score: 90.4, rank: 2, notes: 'L2 Bidder, longer delivery timeline.' },
      { cs_id: cs1.id, vendor_id: vLenovo, quoted_total: 1245000, price_score: 85.0, technical_score: 95.0, delivery_score: 85.0, warranty_score: 95.0, total_score: 89.0, rank: 3, notes: 'L3 Bidder.' }
    ]);
  }
  console.log('✓ CS-2026-0001 with multi-factor scoring matrix seeded.');

  // 8. Purchase Orders (PO) & Amendments
  console.log('\n8. Seeding Purchase Orders...');
  const { data: po1 } = await supabase.from('purchase_orders').insert([{
    po_number: 'PO-2026-0001',
    pr_id: pr1.id,
    cs_id: cs1.id,
    vendor_id: vApex,
    department_id: deptMap['CSE'],
    type: 'regular',
    scope_of_supply: '10x High Performance AI Workstations with 3-Year On-Site OEM Warranty & Installation.',
    price: 1175000,
    taxes: 211500,
    delivery_timeline: '14 calendar days from PO date',
    payment_terms: '100% upon delivery, installation, technical inspection and 3-way match verification.',
    status: 'issued',
    issued_at: new Date().toISOString(),
    created_by: procOfficerId,
    approved_by: evpId,
    approved_at: new Date().toISOString()
  }]).select().single();

  const vPrime = vendorMap['Prime Office Supplies & Stationery'];
  const { data: po2 } = await supabase.from('purchase_orders').insert([{
    po_number: 'PO-2026-0002',
    pr_id: pr5.id,
    vendor_id: vPrime,
    department_id: deptMap['ADMIN'],
    type: 'regular',
    scope_of_supply: '30 Cartons JK Copier A4 75 GSM Paper Reams for Examination Center.',
    price: 45000,
    taxes: 8100,
    delivery_timeline: '3 days from PO issuance',
    payment_terms: 'Payment against 30 days credit invoice.',
    status: 'issued',
    issued_at: new Date().toISOString(),
    created_by: procOfficerId,
    approved_by: hodCseId,
    approved_at: new Date().toISOString()
  }]).select().single();

  // PO Amendment tracking
  if (po1) {
    await supabase.from('po_amendments').insert([{
      po_id: po1.id,
      changed_fields_json: { delivery_timeline: 'Extended by 5 days due to customs clearance on GPU chipsets' },
      old_value_total: 1386500,
      new_value_total: 1386500,
      reason: 'OEM shipment delay notice acknowledged. No financial variation.',
      requires_reapproval: false,
      status: 'approved',
      approved_by: procOfficerId,
      approved_at: new Date().toISOString(),
      created_by: procOfficerId
    }]);
  }
  console.log('✓ Purchase Orders (PO-2026-0001, PO-2026-0002) and amendments seeded.');

  // 9. Delivery Challan & Goods Receipt Note (GRN)
  console.log('\n9. Seeding Delivery Challan & Goods Receipt (GRN)...');
  if (po1) {
    const { data: dc1 } = await supabase.from('delivery_challans').insert([{
      challan_number: 'DC-2026-0001',
      po_id: po1.id,
      vendor_id: vApex,
      items_json: [{ item: 'Intel Xeon AI Workstation', qty: 10, serial_range: 'AIW-2026-001 to AIW-2026-010' }],
      packages_count: 10,
      carrier_details: 'Blue Dart Express AWB# 8847291039',
      remarks: 'All 10 tamper-evident cartons received in sound physical condition.',
      received_by: storesId
    }]).select().single();

    if (dc1) {
      const { data: grn1 } = await supabase.from('grns').insert([{
        grn_number: 'GRN-2026-0001',
        po_id: po1.id,
        delivery_challan_id: dc1.id,
        security_verified_by: storesId,
        security_verified_at: new Date().toISOString(),
        technical_verified_by: hodCseId,
        technical_verified_at: new Date().toISOString(),
        requires_technical_inspection: true,
        status: 'accepted',
        accepted_value: 1175000,
        prepared_by: storesId
      }]).select().single();

      if (grn1) {
        await supabase.from('grn_lines').insert([{
          grn_id: grn1.id,
          description: 'Intel Xeon AI Workstation (64GB DDR5, RTX 4080 16GB, 2TB, 27" 4K)',
          unit: 'units',
          qty_delivered: 10,
          qty_accepted: 10,
          unit_price: 117500,
          inspection_remarks: 'Hardware diagnostic & GPU stress test benchmark completed successfully across all 10 nodes.'
        }]);
      }
    }
  }
  console.log('✓ GRN-2026-0001 verified and accepted.');

  // 10. Invoices & 3-Way Match Payment Gate
  console.log('\n10. Seeding Invoices & Three-Way Match Gate...');
  if (po1) {
    const { data: grnRecord } = await supabase.from('grns').select('id').eq('po_id', po1.id).limit(1).single();

    const { data: inv1 } = await supabase.from('invoices').insert([{
      invoice_number: 'INV-2026-0901',
      po_id: po1.id,
      vendor_id: vApex,
      grn_id: grnRecord?.id || null,
      invoice_amount: 1386500,
      gst_details_json: { gstin: '29ABCDE1234F1Z5', cgst: 105750, sgst: 105750, total_gst: 211500 },
      is_duplicate_check_passed: true,
      match_status: 'matched',
      submitted_by: procOfficerId,
      approved_by: financeId,
      approved_at: new Date().toISOString()
    }]).select().single();

    if (inv1) {
      await supabase.from('payments').insert([{
        invoice_id: inv1.id,
        po_id: po1.id,
        amount: 1386500,
        payment_terms_ref: '100% against 3-Way Match Verification',
        external_ref: 'HDFC-NEFT-20260922-993810',
        payment_mode: 'neft',
        paid_by: financeId
      }]);
    }
  }
  console.log('✓ Invoice INV-2026-0901 3-Way Matched & Disbursed.');

  // 11. Emergency Procurement & Annual Cap Ledger (SOP §9)
  console.log('\n11. Seeding Emergency Procurement & Cap Ledger...');
  await supabase.from('emergency_annual_ledger').upsert({
    financial_year: '2026-27',
    running_total: 85000,
    cap_limit: 1000000
  }, { onConflict: 'financial_year' });

  await supabase.from('emergency_procurements').insert([{
    emergency_number: 'EP-2026-0001',
    requested_by: procOfficerId,
    department_id: deptMap['ADMIN'],
    description: 'Emergency Campus Optical Fiber Backbone Cable Splicing & Trenching Repair',
    estimated_cost: 85000,
    reason_standard_process_failed: 'Heavy construction excavation damaged the primary 24-core single-mode fiber line, disconnecting central data center & university admissions portal.',
    is_post_facto: true,
    evp_approval_status: 'approved',
    evp_approved_by: evpId,
    evp_approved_at: new Date().toISOString(),
    quotations_obtained_count: 2,
    price_reasonableness_note: 'Emergency on-call industrial fiber splicing contractor engaged at standard PWD scheduled emergency rate.',
    vendor_id: vApex,
    financial_year: '2026-27'
  }]);
  console.log('✓ Emergency Procurement EP-2026-0001 & FY2026-27 Ledger seeded.');

  // 12. Vendor Ratings & Evaluation Matrix (Annexure 4)
  console.log('\n12. Seeding Vendor Performance Ratings...');
  const vPrecision = vendorMap['Precision Lab Instruments Corp'];
  const vRatings = [
    {
      vendor_id: vApex,
      review_period: 'FY2026-Q2',
      section_a_score: 24.5,
      section_b_score: 19.0,
      section_c_score: 14.5,
      section_d_score: 19.5,
      section_e_score: 9.5,
      section_f_score: 9.5,
      weighted_score: 96.5,
      outcome: 'preferred',
      notes: 'Exceptional SLA response, flawless technical compliance, and competitive prompt-payment terms.',
      reviewed_by: procOfficerId,
      countersigned_by: pcId,
      evp_approved_by: evpId
    },
    {
      vendor_id: vDell,
      review_period: 'FY2026-Q2',
      section_a_score: 24.0,
      section_b_score: 17.5,
      section_c_score: 13.0,
      section_d_score: 19.0,
      section_e_score: 9.0,
      section_f_score: 8.5,
      weighted_score: 91.0,
      outcome: 'active',
      notes: 'High quality OEM hardware. Minor lead time delays on customized server racks.',
      reviewed_by: procOfficerId,
      countersigned_by: pcId,
      evp_approved_by: evpId
    },
    {
      vendor_id: vPrime,
      review_period: 'FY2026-Q2',
      section_a_score: 22.0,
      section_b_score: 19.5,
      section_c_score: 14.0,
      section_d_score: 17.0,
      section_e_score: 9.0,
      section_f_score: 9.0,
      weighted_score: 90.5,
      outcome: 'active',
      notes: 'Fast turnaround on bulk stationery and examination printing consumables.',
      reviewed_by: procOfficerId,
      countersigned_by: pcId,
      evp_approved_by: evpId
    },
    {
      vendor_id: vPrecision,
      review_period: 'FY2026-Q2',
      section_a_score: 23.5,
      section_b_score: 18.0,
      section_c_score: 13.5,
      section_d_score: 18.5,
      section_e_score: 9.0,
      section_f_score: 8.5,
      weighted_score: 91.0,
      outcome: 'active',
      notes: 'Reliable calibration certifications and prompt laboratory setup support.',
      reviewed_by: procOfficerId,
      countersigned_by: pcId,
      evp_approved_by: evpId
    }
  ];

  for (const r of vRatings) {
    await supabase.from('vendor_ratings').insert([r]);
  }
  console.log('✓ Vendor Performance Ratings seeded for 4 empanelled partners.');

  // 13. Inventory Assets
  console.log('\n13. Seeding Inventory Assets...');
  const invItems = [
    {
      item_code: 'AMC-IT-2026-001',
      item_name: 'Dell PowerEdge R750 2U Rack Server (Dual Xeon, 128GB RAM)',
      category_id: catMap['IT'],
      location_id: locMap['SRV'],
      department: 'Central Administration & Stores',
      department_id: deptMap['ADMIN'],
      quantity_available: 2,
      cost_per_unit: 450000,
      vendor_name: 'Dell Technologies India',
      status: 'in-use',
      created_by: procOfficerId
    },
    {
      item_code: 'AMC-IT-2026-002',
      item_name: 'Intel Xeon AI Workstation (RTX 4080 16GB, 64GB DDR5)',
      category_id: catMap['IT'],
      location_id: locMap['CSE-LAB'],
      department: 'Computer Science & Engineering',
      department_id: deptMap['CSE'],
      quantity_available: 10,
      cost_per_unit: 117500,
      vendor_name: 'Apex Tech Solutions Pvt Ltd',
      status: 'in-use',
      created_by: procOfficerId
    },
    {
      item_code: 'AMC-LAB-2026-003',
      item_name: 'Keysight 200MHz 4-Channel Digital Storage Oscilloscope',
      category_id: catMap['LAB'],
      location_id: locMap['CSE-LAB'],
      department: 'Computer Science & Engineering',
      department_id: deptMap['CSE'],
      quantity_available: 8,
      cost_per_unit: 65000,
      vendor_name: 'Precision Lab Instruments Corp',
      status: 'in-use',
      created_by: facultyId
    },
    {
      item_code: 'AMC-LAB-2026-004',
      item_name: 'CNC 3-Axis Vertical Machining Center Tooling Station',
      category_id: catMap['LAB'],
      location_id: locMap['MECH-CAD'],
      department: 'Mechanical Engineering',
      department_id: deptMap['MECH'],
      quantity_available: 1,
      cost_per_unit: 850000,
      vendor_name: 'Precision Lab Instruments Corp',
      status: 'in-use',
      created_by: hodMechId
    },
    {
      item_code: 'AMC-STAT-2026-005',
      item_name: 'JK Copier A4 75 GSM High Speed Printing Paper Reams',
      category_id: catMap['STAT'],
      location_id: locMap['STR'],
      department: 'Central Administration & Stores',
      department_id: deptMap['ADMIN'],
      quantity_available: 250,
      cost_per_unit: 360,
      vendor_name: 'Prime Office Supplies & Stationery',
      status: 'in-use',
      created_by: storesId
    },
    {
      item_code: 'AMC-FURN-2026-006',
      item_name: 'Ergonomic High-Back Mesh Faculty Task Chairs',
      category_id: catMap['FURN'],
      location_id: locMap['LIB'],
      department: 'Central Administration & Stores',
      department_id: deptMap['ADMIN'],
      quantity_available: 40,
      cost_per_unit: 7500,
      vendor_name: 'Prime Office Supplies & Stationery',
      status: 'in-use',
      created_by: storesId
    }
  ];

  for (const inv of invItems) {
    await supabase.from('inventory').upsert(inv, { onConflict: 'item_code' });
  }
  console.log('✓ Physical Inventory records seeded.');

  // 14. Helpdesk & Maintenance Tickets
  console.log('\n14. Seeding Helpdesk & Maintenance Tickets...');
  const tickets = [
    {
      ticket_number: 'TCK-2026-101',
      name: 'Dr. Ananya Roy',
      email: 'faculty.cse@institution.edu',
      contact_number: '+91 98765 43210',
      department: 'Computer Science & Engineering',
      issue_category: 'Hardware & Computing',
      issue_description: 'Lab Node #04 in CSE AI Computing Lab requires RAM module diagnostic and thermal paste reapplication.',
      priority: 'high',
      status: 'in-progress',
      created_by: facultyId,
      assigned_to: adminUser?.id || procOfficerId
    },
    {
      ticket_number: 'TCK-2026-102',
      name: 'Prof. Ramesh Gupta',
      email: 'hod.mech@institution.edu',
      contact_number: '+91 98765 11223',
      department: 'Mechanical Engineering',
      issue_category: 'Electrical & Power',
      issue_description: 'Three-phase stabilizer in Workshop CNC bay experiencing voltage fluctuation during peak hours.',
      priority: 'urgent',
      status: 'pending',
      created_by: hodMechId
    },
    {
      ticket_number: 'TCK-2026-103',
      name: 'Kavita Joshi',
      email: 'librarian@institution.edu',
      contact_number: '+91 98765 99887',
      department: 'Central Administration & Stores',
      issue_category: 'Network & Internet',
      issue_description: 'Wi-Fi access point in Library Digital Section resetting intermittently.',
      priority: 'medium',
      status: 'resolved',
      created_by: userMap['librarian@institution.edu'],
      assigned_to: adminUser?.id || procOfficerId
    }
  ];

  for (const t of tickets) {
    const { data: insertedTkt } = await supabase.from('tickets').upsert(t, { onConflict: 'ticket_number' }).select('id').single();
    if (insertedTkt) {
      await supabase.from('ticket_updates').insert([{
        ticket_id: insertedTkt.id,
        status_from: 'pending',
        status_to: t.status,
        admin_notes: `System ticket status updated to ${t.status}. Maintenance team assigned.`,
        updated_by: procOfficerId
      }]);
    }
  }
  console.log('✓ Tickets seeded.');

  console.log('\n===============================================================');
  console.log('🎉 ALL INSTITUTIONAL DATA SUCCESSFULLY POPULATED INTO SUPABASE!');
  console.log('===============================================================');
}

const adminUser = { id: USERS_LIST[0] ? null : null };
runPopulation().catch((err) => {
  console.error('Fatal population error:', err);
  process.exit(1);
});
