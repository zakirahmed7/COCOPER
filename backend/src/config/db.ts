
import { Pool } from 'pg';
import { DB_CONFIG } from './env.js';



export const pool = new Pool({
  host: DB_CONFIG.DB_HOST,
  port: Number(DB_CONFIG.DB_PORT),
  database: DB_CONFIG.DB_NAME,
  user: DB_CONFIG.DB_USER,
  password: DB_CONFIG.DB_PASSWORD,
  connectionString: DB_CONFIG.DATABASE_URL,
});

export async function initializeDatabase(): Promise<void> {
  // Only verify database connection
  await pool.query("SELECT 1");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_id UUID PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
      ON auth_sessions (expires_at);
  `);

  // Keep existing Labour Staff databases compatible with the split loading amounts.
  await pool.query(`
    ALTER TABLE labours
      ADD COLUMN IF NOT EXISTS loading_10_tons_amount NUMERIC DEFAULT 0,
      ADD COLUMN IF NOT EXISTS loading_20_tons_amount NUMERIC DEFAULT 0
  `);
  try {
    await pool.query(`
      UPDATE labours
      SET loading_10_tons_amount = COALESCE(loading_amount, 0)
      WHERE loading_amount IS NOT NULL
    `);
  } catch {
    // The legacy column is absent on fresh installations.
  }
  await pool.query("ALTER TABLE labours DROP COLUMN IF EXISTS loading_amount");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS mobile_labour_attendance (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      labour_name VARCHAR(200) NOT NULL,
      user_id UUID NOT NULL REFERENCES organization_users(id) ON DELETE RESTRICT,
      attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
      in_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      out_time TIMESTAMPTZ,
      total_working_hours NUMERIC(10, 2) NOT NULL DEFAULT 0,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_mobile_labour_attendance_scope
      ON mobile_labour_attendance (organization_id, branch_id, attendance_date);
    CREATE INDEX IF NOT EXISTS idx_mobile_labour_attendance_user
      ON mobile_labour_attendance (user_id, attendance_date);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS loading_dispatch_entries (
      id TEXT PRIMARY KEY, dispatch_number TEXT NOT NULL, organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL, lorry_number TEXT NOT NULL DEFAULT '', driver_name TEXT NOT NULL DEFAULT '', driver_mobile TEXT NOT NULL DEFAULT '',
      dispatch_date DATE,
      dispatch_status TEXT NOT NULL DEFAULT 'Draft', invoice_generated BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS loading_dispatch_entry_lines (
      id TEXT PRIMARY KEY, dispatch_id TEXT NOT NULL REFERENCES loading_dispatch_entries(id) ON DELETE CASCADE,
      branch_id TEXT NOT NULL, line_date DATE NOT NULL, item_id TEXT NOT NULL, bharthi TEXT NOT NULL DEFAULT '',
      quantity NUMERIC NOT NULL DEFAULT 0, loaded_quantity NUMERIC NOT NULL DEFAULT 0, pending_quantity NUMERIC NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_loading_dispatch_entries_org ON loading_dispatch_entries(organization_id);
    CREATE INDEX IF NOT EXISTS idx_loading_dispatch_entry_lines_dispatch ON loading_dispatch_entry_lines(dispatch_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS labour_attendance (
      id TEXT PRIMARY KEY,
      labour_id TEXT,
      labour_name TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'Regular',
      attendance_date DATE NOT NULL,
      shift TEXT NOT NULL DEFAULT 'Morning',
      in_time TEXT,
      out_time TEXT,
      hours NUMERIC NOT NULL DEFAULT 0,
      morning_ot NUMERIC NOT NULL DEFAULT 0,
      evening_ot NUMERIC NOT NULL DEFAULT 0,
      ot_hours NUMERIC NOT NULL DEFAULT 0,
      ot_rate NUMERIC NOT NULL DEFAULT 150,
      loading_10_tons_amount NUMERIC NOT NULL DEFAULT 0,
      loading_20_tons_amount NUMERIC NOT NULL DEFAULT 0,
      total_ot_amount NUMERIC NOT NULL DEFAULT 0,
      organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      payment_group_id TEXT,
      payment_status TEXT NOT NULL DEFAULT 'Draft',
      payment_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at DATE DEFAULT CURRENT_DATE
    )
  `);
  await pool.query(`
    ALTER TABLE labour_attendance
      ALTER COLUMN labour_id DROP NOT NULL,
      ADD COLUMN IF NOT EXISTS labour_name TEXT NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'Regular',
      ADD COLUMN IF NOT EXISTS shift TEXT NOT NULL DEFAULT 'Morning',
      ADD COLUMN IF NOT EXISTS hours NUMERIC NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS morning_ot NUMERIC NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS evening_ot NUMERIC NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ot_hours NUMERIC NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS ot_rate NUMERIC NOT NULL DEFAULT 150,
      ADD COLUMN IF NOT EXISTS loading_10_tons_amount NUMERIC NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS loading_20_tons_amount NUMERIC NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total_ot_amount NUMERIC NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE
        ,ADD COLUMN IF NOT EXISTS payment_group_id TEXT
        ,ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'Draft'
        ,ADD COLUMN IF NOT EXISTS payment_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  `);
        await pool.query(`ALTER TABLE loading_dispatch_entries ADD COLUMN IF NOT EXISTS dispatch_date DATE`);
    await pool.query(`
      ALTER TABLE labour_attendance
        DROP CONSTRAINT IF EXISTS labour_attendance_labour_id_attendance_date_key
    `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'Local',
      state TEXT,
      address TEXT,
      mobile TEXT,
      whatsapp TEXT,
      contact_person TEXT,
      contact_person1 TEXT,
      contact_no1 TEXT,
      contact_person2 TEXT,
      contact_no2 TEXT,
      contact_person3 TEXT,
      contact_no3 TEXT,
      credit_limit NUMERIC NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Active',
      organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      created_at DATE DEFAULT CURRENT_DATE
    )
  `);

  await pool.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_person TEXT");
  await pool.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_person1 TEXT");
  await pool.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_no1 TEXT");
  await pool.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_person2 TEXT");
  await pool.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_no2 TEXT");
  await pool.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_person3 TEXT");
  await pool.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_no3 TEXT");
  await pool.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit NUMERIC NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Active'");
  await pool.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE");
  await pool.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_at DATE DEFAULT CURRENT_DATE");
  await pool.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS state TEXT");
  await pool.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS address TEXT");
  await pool.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS mobile TEXT");
  await pool.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp TEXT");
  await pool.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS code TEXT");
  await pool.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS name TEXT");
  await pool.query("ALTER TABLE customers ADD COLUMN IF NOT EXISTS type TEXT");

  // Keep existing installations compatible with organization registration fields.
  await pool.query(
    "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS street VARCHAR(255)"
  );
  await pool.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_organizations_email ON organizations (LOWER(email))"
  );
  await pool.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_organization_code ON customers (organization_id, code) WHERE organization_id IS NOT NULL"
  );
  await pool.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_organization_code ON suppliers (organization_id, code) WHERE organization_id IS NOT NULL"
  );
  // Keep existing installations compatible with protected owner roles.
  await pool.query(
    "ALTER TABLE roles ADD COLUMN IF NOT EXISTS is_system_role BOOLEAN NOT NULL DEFAULT FALSE"
  );
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_owner_role_per_organization
    ON roles (organization_id)
    WHERE is_system_role = TRUE AND role_name = 'OWNER'
  `);
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_organization_users_email ON organization_users (LOWER(email))"
  );
  await pool.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_organization_users_email ON organization_users (LOWER(email)) WHERE email IS NOT NULL"
  );
  await pool.query(`
    UPDATE organization_users ou
    SET email = o.email
    FROM organizations o
    WHERE ou.organization_id = o.id
      AND ou.is_primary_user = TRUE
      AND ou.email IS NULL
  `);
  // Keep existing installations compatible with persisted sales-order approval.
  await pool.query(
    "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Draft'"
  );
  await pool.query(
    "ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS sales_invoice_status BOOLEAN NOT NULL DEFAULT FALSE"
  );
  await pool.query(
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS branch_id TEXT"
  );
  await pool.query(
    "ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS purchase_order_invoice_status BOOLEAN NOT NULL DEFAULT FALSE"
  );
  await pool.query(
    "ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS purchase_order_id TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL"
  );
  await pool.query(
    "ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'Draft'"
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS item_branch_stock (
      id TEXT PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      item_code TEXT NOT NULL,
      branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      branch_name TEXT NOT NULL,
      stock NUMERIC NOT NULL DEFAULT 0 CHECK (stock >= 0),
      pieces NUMERIC NOT NULL DEFAULT 0 CHECK (pieces >= 0),
      base_cost NUMERIC NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (organization_id, item_id, branch_id)
    )
  `);
  await pool.query(`
    ALTER TABLE item_branch_stock
      ADD COLUMN IF NOT EXISTS pieces NUMERIC NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS base_cost NUMERIC NOT NULL DEFAULT 0
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS item_stock_ledger (
      id TEXT PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      transaction_date DATE NOT NULL,
      in_quantity_stock NUMERIC,
      out_quantity_stock NUMERIC,
      rate NUMERIC NOT NULL DEFAULT 0,
      stock_type TEXT NOT NULL CHECK (stock_type IN ('Purchase', 'Sales')),
      source_id TEXT NOT NULL,
      source_number TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (
        (stock_type = 'Purchase' AND in_quantity_stock IS NOT NULL AND out_quantity_stock IS NULL)
        OR
        (stock_type = 'Sales' AND out_quantity_stock IS NOT NULL AND in_quantity_stock IS NULL)
      )
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uq_item_stock_ledger_source_item_type
      ON item_stock_ledger (source_id, item_id, stock_type);
    CREATE INDEX IF NOT EXISTS idx_item_stock_ledger_scope_date
      ON item_stock_ledger (organization_id, branch_id, item_id, transaction_date);
  `);
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_item_branch_stock_org_item ON item_branch_stock (organization_id, item_id)"
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gunny_bag_branch_stock (
      id TEXT PRIMARY KEY,
      organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      gunny_bag_id TEXT NOT NULL REFERENCES gunny_bags(id) ON DELETE CASCADE,
      branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      stock NUMERIC NOT NULL DEFAULT 0 CHECK (stock >= 0),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (gunny_bag_id, branch_id)
    )
  `);
  await pool.query(
    "CREATE INDEX IF NOT EXISTS idx_gunny_bag_branch_stock_bag ON gunny_bag_branch_stock (gunny_bag_id)"
  );
  await pool.query(
    "ALTER TABLE items ADD COLUMN IF NOT EXISTS branch_wise_stock NUMERIC NOT NULL DEFAULT 0"
  );
  await pool.query("ALTER TABLE direct_sales ADD COLUMN IF NOT EXISTS organization_id UUID");
  await pool.query("ALTER TABLE direct_sales ADD COLUMN IF NOT EXISTS branch_id UUID");
  await pool.query("ALTER TABLE direct_sales ADD COLUMN IF NOT EXISTS sales_order_no TEXT");
  await pool.query("ALTER TABLE direct_sales ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT FALSE");
  await pool.query("ALTER TABLE direct_sales ADD COLUMN IF NOT EXISTS outstanding_amount NUMERIC NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE direct_sales ADD COLUMN IF NOT EXISTS customer_receipt_status BOOLEAN NOT NULL DEFAULT FALSE");
  await pool.query("ALTER TABLE direct_sales ADD COLUMN IF NOT EXISTS gunny_bags_total NUMERIC NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE direct_sales ADD COLUMN IF NOT EXISTS transportation_charges NUMERIC NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE direct_sales ADD COLUMN IF NOT EXISTS loading_charges NUMERIC NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE direct_sales ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'tonage'");
  await pool.query("ALTER TABLE direct_sales ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::timestamp");
  await pool.query("ALTER TABLE direct_sales ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP");
  await pool.query("ALTER TABLE direct_sale_items ADD COLUMN IF NOT EXISTS discount NUMERIC NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE direct_sale_items ADD COLUMN IF NOT EXISTS actual_quantity NUMERIC NOT NULL DEFAULT 0");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS direct_sale_gunny_bags (
      id TEXT PRIMARY KEY,
      direct_sale_id TEXT NOT NULL REFERENCES direct_sales(id) ON DELETE CASCADE,
      gunny_bag_id TEXT NOT NULL REFERENCES gunny_bags(id),
      bag_bharthi TEXT,
      bharthi_type_id TEXT REFERENCES gunny_bag_bharthi_types(id),
      quantity NUMERIC NOT NULL DEFAULT 0,
      rate NUMERIC NOT NULL DEFAULT 0,
      amount NUMERIC NOT NULL DEFAULT 0
    )
  `);
  await pool.query("ALTER TABLE direct_sale_gunny_bags ADD COLUMN IF NOT EXISTS bag_bharthi TEXT");
    await pool.query("ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS outstanding_amount NUMERIC NOT NULL DEFAULT 0");
    await pool.query("ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS supplier_payment_receipt_status BOOLEAN NOT NULL DEFAULT TRUE");
    await pool.query("UPDATE purchase_invoices SET outstanding_amount = grand_total WHERE outstanding_amount = 0 AND grand_total > 0");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customer_receipts (
      id TEXT PRIMARY KEY,
      receipt_no TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      customer_name TEXT,
      receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
      invoice_mode TEXT NOT NULL DEFAULT 'Invoice by Invoice',
      invoice_no TEXT,
      amount NUMERIC NOT NULL DEFAULT 0,
      payment_mode TEXT NOT NULL DEFAULT 'Cash',
      remarks TEXT,
      approved BOOLEAN NOT NULL DEFAULT FALSE,
      organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query("ALTER TABLE customer_receipts ADD COLUMN IF NOT EXISTS customer_name TEXT");
  await pool.query("ALTER TABLE customer_receipts ADD COLUMN IF NOT EXISTS receipt_date DATE DEFAULT CURRENT_DATE");
  await pool.query("ALTER TABLE customer_receipts ADD COLUMN IF NOT EXISTS invoice_mode TEXT NOT NULL DEFAULT 'Invoice by Invoice'");
  await pool.query("ALTER TABLE customer_receipts ADD COLUMN IF NOT EXISTS invoice_no TEXT");
  await pool.query("ALTER TABLE customer_receipts ADD COLUMN IF NOT EXISTS amount NUMERIC NOT NULL DEFAULT 0");
  await pool.query("ALTER TABLE customer_receipts ADD COLUMN IF NOT EXISTS payment_mode TEXT NOT NULL DEFAULT 'Cash'");
  await pool.query("ALTER TABLE customer_receipts ADD COLUMN IF NOT EXISTS remarks TEXT");
  await pool.query("ALTER TABLE customer_receipts ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT FALSE");
  await pool.query("ALTER TABLE customer_receipts ADD COLUMN IF NOT EXISTS attachment_names TEXT");
  await pool.query("ALTER TABLE customer_receipts ADD COLUMN IF NOT EXISTS attachment_files TEXT");
  await pool.query("ALTER TABLE customer_receipts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE");
  await pool.query("ALTER TABLE customer_receipts ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::timestamp");
  await pool.query("ALTER TABLE customer_receipts ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_receipts_org_receipt_no ON customer_receipts (organization_id, receipt_no) WHERE organization_id IS NOT NULL");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_customer_receipts_customer_id ON customer_receipts(customer_id)");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_customer_receipts_date ON customer_receipts(receipt_date)");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS supplier_payments (
      id TEXT PRIMARY KEY,
      payment_number TEXT NOT NULL,
      supplier_id TEXT NOT NULL,
      supplier_name TEXT,
      payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
      invoice_mode TEXT NOT NULL DEFAULT 'Invoice by Invoice',
      payment_mode TEXT NOT NULL DEFAULT 'Cash',
      amount NUMERIC NOT NULL DEFAULT 0,
      purchase_invoice_id TEXT,
      remarks TEXT,
      approved BOOLEAN NOT NULL DEFAULT FALSE,
      organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
    await pool.query("ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS attachment_names TEXT");
    await pool.query("ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS attachment_files TEXT");
  await pool.query("ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS invoice_mode TEXT NOT NULL DEFAULT 'Invoice by Invoice'");
  await pool.query("ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT FALSE");
  await pool.query("ALTER TABLE supplier_payments ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_payments_org_number ON supplier_payments (organization_id, payment_number) WHERE organization_id IS NOT NULL");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cash_bank_expenses (
      id TEXT PRIMARY KEY,
      organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
      expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
      payment_mode TEXT NOT NULL CHECK (payment_mode IN ('Cash', 'Bank', 'UPI')),
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('Expenses', 'Income')),
      amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
      description TEXT NOT NULL DEFAULT '',
      attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
      approved BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_cash_bank_expenses_org_date
      ON cash_bank_expenses (organization_id, expense_date DESC, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_cash_bank_expenses_branch
      ON cash_bank_expenses (organization_id, branch_id);
  `);
  await pool.query("ALTER TABLE cash_bank_expenses ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT FALSE");
  await pool.query("ALTER TABLE cash_bank_expenses ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb");
  console.log("Database connected successfully.");
}
