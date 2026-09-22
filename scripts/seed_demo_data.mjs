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

const DEMO_USERS = [
  {
    email: 'admin@institution.edu',
    fullName: 'Dr. System Administrator',
    role: 'admin',
    deptCode: 'ADMIN'
  },
  {
    email: 'evp@institution.edu',
    fullName: 'Dr. Rajesh Sharma (EVP)',
    role: 'evp',
    deptCode: 'ADMIN'
  },
  {
    email: 'principal@institution.edu',
    fullName: 'Dr. Anand Kumar (Principal)',
    role: 'principal',
    deptCode: 'ADMIN'
  },
  {
    email: 'hod.cse@institution.edu',
    fullName: 'Prof. Vikram Seth (HOD CSE)',
    role: 'hod',
    deptCode: 'CSE'
  },
  {
    email: 'hod.mech@institution.edu',
    fullName: 'Prof. Ramesh Gupta (HOD MECH)',
    role: 'hod',
    deptCode: 'MECH'
  },
  {
    email: 'procurement.officer@institution.edu',
    fullName: 'Suresh Menon (Procurement Officer)',
    role: 'procurement_officer',
    deptCode: 'ADMIN'
  },
  {
    email: 'purchase.committee@institution.edu',
    fullName: 'Prof. Sunita Rao (Purchase Committee Chair)',
    role: 'purchase_committee',
    deptCode: 'ADMIN'
  },
  {
    email: 'finance@institution.edu',
    fullName: 'Priya Nambiar (Finance Officer)',
    role: 'finance',
    deptCode: 'ADMIN'
  },
  {
    email: 'stores@institution.edu',
    fullName: 'Manoj Kumar (Central Stores Keeper)',
    role: 'stores',
    deptCode: 'ADMIN'
  },
  {
    email: 'faculty.cse@institution.edu',
    fullName: 'Dr. Ananya Roy (Faculty Requisitioner)',
    role: 'user',
    deptCode: 'CSE'
  },
  {
    email: 'librarian@institution.edu',
    fullName: 'Kavita Joshi (Chief Librarian)',
    role: 'librarian',
    deptCode: 'ADMIN'
  }
];

async function seed() {
  console.log('========================================');
  console.log('🚀 SEEDING DEMO DATA TO SUPABASE');
  console.log('========================================\n');

  // 1. Departments
  console.log('1. Seeding Departments...');
  const deptsData = [
    { name: 'Computer Science & Engineering', prefix: 'CSE' },
    { name: 'Electrical & Electronics Engineering', prefix: 'EEE' },
    { name: 'Mechanical Engineering', prefix: 'MECH' },
    { name: 'Civil Engineering', prefix: 'CIVIL' },
    { name: 'Central Administration & Stores', prefix: 'ADMIN' }
  ];

  const deptMap = {};
  for (const d of deptsData) {
    const { data: existing } = await supabase.from('departments').select('id, name, prefix').eq('prefix', d.prefix).maybeSingle();
    if (existing) {
      deptMap[d.prefix] = existing.id;
    } else {
      const { data: inserted, error } = await supabase.from('departments').insert([d]).select('id, prefix').single();
      if (error) console.error('Error creating department:', d.prefix, error.message);
      else deptMap[d.prefix] = inserted.id;
    }
  }
  console.log('✓ Departments ready:', Object.keys(deptMap).join(', '));

  // 2. Locations & Categories
  console.log('\n2. Seeding Locations & Categories...');
  const locs = [
    { name: 'Main Server Room (Room 101)', building: 'Academic Block A', prefix: 'SRV' },
    { name: 'CSE Advanced Computing Lab', building: 'Tech Block 2', prefix: 'CSE-LAB' },
    { name: 'Central Stores Warehouse', building: 'Admin Annex', prefix: 'STR' },
    { name: 'Central Library First Floor', building: 'Library Complex', prefix: 'LIB' }
  ];
  for (const l of locs) {
    await supabase.from('locations').upsert(l, { onConflict: 'name' });
  }

  const cats = [
    { name: 'IT & Computing Hardware', prefix: 'IT' },
    { name: 'Lab Equipment & Instruments', prefix: 'LAB' },
    { name: 'Office Stationery & Consumables', prefix: 'STAT' },
    { name: 'Software & Licenses', prefix: 'SOFT' },
    { name: 'Furniture & Fixtures', prefix: 'FURN' }
  ];
  for (const c of cats) {
    await supabase.from('categories').upsert(c, { onConflict: 'name' });
  }
  console.log('✓ Locations and Categories ready.');

  // 3. Demo Users & Auth
  console.log('\n3. Creating Demo Users...');
  const userMap = {};
  for (const u of DEMO_USERS) {
    // Check if auth user exists
    const { data: userList } = await supabase.auth.admin.listUsers();
    let authUser = userList?.users?.find((x) => x.email?.toLowerCase() === u.email.toLowerCase());

    if (!authUser) {
      const { data: newUser, error: authErr } = await supabase.auth.admin.createUser({
        email: u.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: u.fullName }
      });
      if (authErr) {
        console.error(`Failed to create auth user ${u.email}:`, authErr.message);
        continue;
      }
      authUser = newUser.user;
      console.log(`+ Created Auth User: ${u.email} (${u.role})`);
    } else {
      console.log(`= Auth User exists: ${u.email}`);
    }

    userMap[u.email] = authUser.id;

    // Upsert Profile
    await supabase.from('profiles').upsert({
      id: authUser.id,
      email: u.email,
      full_name: u.fullName,
      department: u.deptCode,
      updated_at: new Date().toISOString()
    });

    // Assign Role
    await supabase.from('user_roles').upsert({
      user_id: authUser.id,
      role: u.role,
      department_id: deptMap[u.deptCode] || null,
      approval_notes: `System seeded demo role: ${u.role}`
    }, { onConflict: 'user_id,role' });
  }
  console.log('✓ All 11 Demo Users configured with credentials.');

  // 4. Empanelled Vendors
  console.log('\n4. Seeding Empanelled & Evaluated Vendors...');
  const vendorsData = [
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
      name: 'Substandard Facilities & Maintenance',
      registered_address: '99 Industrial Area, Peenya, Bangalore - 560058',
      gst_number: '29DDDDD2222M1ZY',
      pan_number: 'DDDDD2222M',
      status: 'debarred',
      empanelled_on: '2025-08-01',
      empanelment_expiry: '2026-08-01',
      bank_details_json: { bank: 'Axis Bank', ac_no: '918020011223344', ifsc: 'UTIB0000004' }
    }
  ];

  const vendorMap = {};
  for (const v of vendorsData) {
    const { data: existing } = await supabase.from('vendors').select('id, name').eq('name', v.name).maybeSingle();
    if (existing) {
      vendorMap[v.name] = existing.id;
    } else {
      const { data: inserted, error } = await supabase.from('vendors').insert([v]).select('id, name').single();
      if (error) console.error('Error inserting vendor:', v.name, error.message);
      else vendorMap[v.name] = inserted.id;
    }
  }
  console.log('✓ Vendors seeded.');

  // 5. Sample Purchase Requisitions
  console.log('\n5. Seeding Purchase Requisitions...');
  const facultyId = userMap['faculty.cse@institution.edu'];
  const hodId = userMap['hod.cse@institution.edu'];
  const evpId = userMap['evp@institution.edu'];

  // PR 1: CSE High-Performance Workstations (₹12,00,000 - Approved by EVP)
  const { data: pr1 } = await supabase.from('purchase_requisitions').insert([{
    pr_number: 'PR-2026-0001',
    title: 'High-Performance Workstations for AI/ML Lab',
    department_id: deptMap['CSE'],
    requisitioner_id: facultyId,
    category: 'equipment_asset',
    estimated_total: 1200000,
    status: 'approved',
    required_by_date: '2026-10-31',
    justification: 'Required for newly introduced M.Tech AI/ML curriculum & GPU compute laboratory.'
  }]).select().single();

  if (pr1) {
    await supabase.from('pr_line_items').insert([
      {
        pr_id: pr1.id,
        item_name: 'Intel Xeon AI Workstation (64GB RAM, RTX 4080 16GB)',
        specification: 'Intel Xeon Silver 4410Y, 64GB DDR5 ECC, 2TB NVMe Gen4, NVIDIA RTX 4080 16GB, 27-inch 4K Monitor',
        quantity: 10,
        unit_of_measure: 'units',
        estimated_unit_price: 120000,
        estimated_line_total: 1200000
      }
    ]);

    await supabase.from('pr_approvals').insert([
      {
        pr_id: pr1.id,
        approver_id: hodId,
        approver_role: 'hod',
        status: 'approved',
        comments: 'Recommended. Lab infrastructure expansion approved in annual budget.'
      },
      {
        pr_id: pr1.id,
        approver_id: evpId,
        approver_role: 'evp',
        status: 'approved',
        comments: 'Approved as per institutional capital expenditure ceiling.'
      }
    ]);
  }

  // PR 2: Small Value Stationery (₹1,800 - Approved by HOD)
  const { data: pr2 } = await supabase.from('purchase_requisitions').insert([{
    pr_number: 'PR-2026-0002',
    title: 'Office Whiteboard Markers & Dusters',
    department_id: deptMap['CSE'],
    requisitioner_id: facultyId,
    category: 'small_value',
    estimated_total: 1800,
    status: 'approved',
    required_by_date: '2026-09-30',
    justification: 'Replenishment of classroom teaching consumables.'
  }]).select().single();

  if (pr2) {
    await supabase.from('pr_line_items').insert([
      {
        pr_id: pr2.id,
        item_name: 'Whiteboard Marker Set (Assorted 10-pack)',
        specification: 'Non-toxic, dry erase marker pens',
        quantity: 6,
        unit_of_measure: 'boxes',
        estimated_unit_price: 300,
        estimated_line_total: 1800
      }
    ]);
  }

  // PR 3: Mechanical CAD Software (₹45,000 - Pending Approval)
  const { data: pr3 } = await supabase.from('purchase_requisitions').insert([{
    pr_number: 'PR-2026-0003',
    title: 'Autodesk Inventor Student Lab Multi-Seat License',
    department_id: deptMap['MECH'],
    requisitioner_id: userMap['hod.mech@institution.edu'],
    category: 'software',
    estimated_total: 45000,
    status: 'pending_approval',
    required_by_date: '2026-11-15',
    justification: 'Annual license renewal for CAD/CAM simulation lab.'
  }]).select().single();

  if (pr3) {
    await supabase.from('pr_line_items').insert([
      {
        pr_id: pr3.id,
        item_name: 'Autodesk CAD/CAM Academic License',
        specification: '50-Seat floating lab license 1-year subscription',
        quantity: 1,
        unit_of_measure: 'subscription',
        estimated_unit_price: 45000,
        estimated_line_total: 45000
      }
    ]);
  }
  console.log('✓ Purchase Requisitions seeded (PR-2026-0001, PR-2026-0002, PR-2026-0003).');

  // 6. Sourcing & RFQ for PR 1
  console.log('\n6. Seeding RFQ, Quotes, CS & Purchase Order for PR-2026-0001...');
  if (pr1) {
    const { data: rfq } = await supabase.from('rfqs').insert([{
      rfq_number: 'RFQ-2026-0001',
      pr_id: pr1.id,
      title: 'Competitive RFQ - AI/ML Workstations (10 Units)',
      status: 'submitted',
      submission_deadline: '2026-10-10'
    }]).select().single();

    if (rfq) {
      // Link 3 Empanelled Vendors
      await supabase.from('rfq_vendors').insert([
        { rfq_id: rfq.id, vendor_id: vendorMap['Apex Tech Solutions Pvt Ltd'] },
        { rfq_id: rfq.id, vendor_id: vendorMap['Dell Technologies India'] },
        { rfq_id: rfq.id, vendor_id: vendorMap['Lenovo Enterprise Solutions'] }
      ]);

      // Quotations
      // Quote 1: Lenovo (L1 - ₹11,40,000)
      const { data: qLenovo } = await supabase.from('quotations').insert([{
        rfq_id: rfq.id,
        vendor_id: vendorMap['Lenovo Enterprise Solutions'],
        quotation_number: 'QT-LEN-2026-99',
        total_amount: 1140000,
        is_compliant: true,
        delivery_period_days: 14,
        warranty_months: 36
      }]).select().single();

      // Quote 2: Dell (L2 - ₹11,80,000)
      await supabase.from('quotations').insert([{
        rfq_id: rfq.id,
        vendor_id: vendorMap['Dell Technologies India'],
        quotation_number: 'QT-DEL-2026-44',
        total_amount: 1180000,
        is_compliant: true,
        delivery_period_days: 21,
        warranty_months: 36
      }]);

      // Quote 3: Apex (L3 - ₹12,00,000)
      await supabase.from('quotations').insert([{
        rfq_id: rfq.id,
        vendor_id: vendorMap['Apex Tech Solutions Pvt Ltd'],
        quotation_number: 'QT-APX-2026-12',
        total_amount: 1200000,
        is_compliant: true,
        delivery_period_days: 10,
        warranty_months: 36
      }]);

      // Comparative Statement
      const { data: cs } = await supabase.from('comparative_statements').insert([{
        cs_number: 'CS-2026-0001',
        rfq_id: rfq.id,
        pr_id: pr1.id,
        recommended_vendor_id: vendorMap['Lenovo Enterprise Solutions'],
        recommended_total: 1140000,
        is_lowest_price: true,
        status: 'approved',
        recommendation_rationale: 'Lowest compliant bid (L1). Meets all OEM GPU & RAM specifications with 3-year onsite warranty.',
        prepared_by: userMap['procurement.officer@institution.edu'],
        approved_by: userMap['evp@institution.edu']
      }]).select().single();

      // Purchase Order PO-2026-0001
      if (cs) {
        const { data: po } = await supabase.from('purchase_orders').insert([{
          po_number: 'PO-2026-0001',
          pr_id: pr1.id,
          cs_id: cs.id,
          vendor_id: vendorMap['Lenovo Enterprise Solutions'],
          total_value: 1140000,
          status: 'issued',
          delivery_date: '2026-10-25',
          payment_terms: '100% post delivery & 3-way match approval',
          issued_by: userMap['procurement.officer@institution.edu'],
          issued_at: new Date().toISOString()
        }]).select().single();

        // Delivery Challan & GRN
        if (po) {
          const { data: dc } = await supabase.from('delivery_challans').insert([{
            dc_number: 'DC-LENV-8841',
            po_id: po.id,
            vendor_id: vendorMap['Lenovo Enterprise Solutions'],
            delivery_date: '2026-10-20',
            gate_pass_number: 'GP-2026-1092',
            items_summary: '10x Lenovo ThinkStation P-Series AI Units'
          }]).select().single();

          if (dc) {
            const { data: grn } = await supabase.from('grns').insert([{
              grn_number: 'GRN-2026-0001',
              po_id: po.id,
              dc_id: dc.id,
              vendor_id: vendorMap['Lenovo Enterprise Solutions'],
              status: 'accepted',
              inspection_date: '2026-10-21',
              inspected_by: userMap['stores@institution.edu'],
              technical_acceptance_by: userMap['hod.cse@institution.edu'],
              accepted_value: 1140000,
              remarks: 'All 10 systems unboxed, benchmarked and accepted in good working condition.'
            }]).select().single();

            // Invoice & 3-Way Match
            if (grn) {
              await supabase.from('invoices').insert([{
                invoice_number: 'INV-LENV-2026-091',
                po_id: po.id,
                grn_id: grn.id,
                vendor_id: vendorMap['Lenovo Enterprise Solutions'],
                invoice_amount: 1140000,
                invoice_date: '2026-10-22',
                status: 'matched',
                match_status: 'matched',
                approved_by: userMap['finance@institution.edu']
              }]);
            }
          }
        }
      }
    }
  }
  console.log('✓ Full Procure-to-Pay Lifecycle Records (RFQ, CS, PO, GRN, Invoice) seeded.');

  // 7. Emergency Procurement Demo
  console.log('\n7. Seeding Emergency Procurement...');
  await supabase.from('emergency_annual_ledger').upsert({
    financial_year: '2026-2027',
    total_spent: 150000,
    annual_cap: 1000000,
    headroom_available: 850000
  }, { onConflict: 'financial_year' });

  await supabase.from('emergency_procurements').insert([{
    request_number: 'EP-2026-0001',
    department_id: deptMap['CSE'],
    title: 'Emergency Server Room 40kVA UPS Battery Bank Replacement',
    description: 'Catastrophic battery burst during power surge threatening central campus datacenter.',
    estimated_amount: 150000,
    financial_year: '2026-2027',
    justification_category: 'threat_to_life_or_data_safety',
    evp_approval_status: 'approved',
    evp_approved_at: new Date().toISOString(),
    evp_approver_id: userMap['evp@institution.edu'],
    initiator_id: userMap['hod.cse@institution.edu'],
    statutory_48h_window_met: true
  }]);
  console.log('✓ Emergency Procurement record seeded.');

  // 8. Sample Inventory Assets
  console.log('\n8. Seeding Inventory Assets...');
  const sampleInventory = [
    {
      name: 'Dell Precision Tower 3660 Workstation',
      category: 'IT & Computing Hardware',
      department: 'CSE',
      quantity_available: 15,
      cost_per_unit: 115000,
      room_no: 'Lab 102',
      specifications: 'Intel Core i9 13900K, 64GB DDR5, 1TB NVMe, RTX 3080',
      asset_type: 'Capital Asset',
      status: 'In Use'
    },
    {
      name: 'Epson EB-2250U 5000-Lumen WUXGA Projector',
      category: 'IT & Computing Hardware',
      department: 'CSE',
      quantity_available: 4,
      cost_per_unit: 85000,
      room_no: 'Seminar Hall 1',
      specifications: '5,000 lumens, Full HD WUXGA, HDMI/VGA',
      asset_type: 'Capital Asset',
      status: 'In Use'
    },
    {
      name: 'Universal Testing Machine (UTM) 100kN',
      category: 'Lab Equipment & Instruments',
      department: 'MECH',
      quantity_available: 1,
      cost_per_unit: 450000,
      room_no: 'Materials Testing Lab',
      specifications: 'Computerized UTM 100kN capacity with load cell and extensometer',
      asset_type: 'Capital Asset',
      status: 'In Use'
    },
    {
      name: 'Ergonomic Faculty Mesh Chairs',
      category: 'Furniture & Fixtures',
      department: 'ADMIN',
      quantity_available: 30,
      cost_per_unit: 4500,
      room_no: 'Faculty Cabins Block B',
      specifications: 'High back mesh, adjustable lumbar support',
      asset_type: 'Consumable/Furniture',
      status: 'In Use'
    }
  ];

  for (const item of sampleInventory) {
    await supabase.from('inventory').insert([item]);
  }
  console.log('✓ Inventory items seeded.');

  console.log('\n========================================');
  console.log('🎉 SEEDING COMPLETED SUCCESSFULLY!');
  console.log('========================================');
}

seed().catch((err) => {
  console.error('Fatal Seeding Error:', err);
  process.exit(1);
});
