// ─── Translation dictionary ───────────────────────────────────────────────────
// Add new keys here. Components use useLang() to get the t() function.

export const translations = {
  en: {
    // Sidebar nav
    nav_dashboard:       'Dashboard',
    nav_stock:           'Stock',
    nav_calculator:      'Calculator',
    nav_offering_letter: 'Offering Letter',
    nav_sales_order:     'Sales Order',
    nav_purchase_order:  'Purchase Order',
    nav_delivery_order:  'Delivery Order',
    nav_mops:            'MOPS Data',
    nav_master_data:     'Master Data',
    nav_corporate:       'Corporate',
    nav_clients:         'Clients',
    nav_suppliers:       'Suppliers',
    nav_products:        'Products',
    nav_facilities:      'Facilities',
    nav_settings:        'Settings',
    nav_change_pw:       'Change Password',
    nav_logout:          'Log Out',
    nav_guide:           'User Guide',
    nav_manual:          'Manual',

    // Dashboard
    dash_title:          'Dashboard',
    dash_sub:            'PT Global Petro Pasifik',
    dash_no_tasks:       'No pending tasks — all documents have been processed.',
    dash_pending_title:  'Documents Awaiting Your Approval',
    dash_confirmed_stock:'Confirmed Stock',
    dash_committed_so:   'Committed SO',
    dash_total_po:       'Total PO',
    dash_delivery:       'Delivery Orders',
    dash_recent_so:      'Recent Sales Orders',
    dash_view_all:       'View All →',
    dash_empty_stock:    'No confirmed stock yet.',
    dash_empty_so:       'No sales orders yet.',

    // Stock
    stock_title:         'Stock',
    stock_sub:           'Cargo positions & supply tranche management',
    stock_new:           '+ New Position',
    stock_new_tranche:   '+ Add Tranche',
    stock_link_po:       '🔗 Link PO',
    stock_calc:          '🧮 Calculator',

    // Calculator
    calc_title:          'Calculator',
    calc_sub:            'P&L modelling — blended cost, cost of money, margin',
    calc_to_ol:          '📄 Create Offering Letter',
    calc_save:           '💾 Save Calculation',

    // Offering Letter
    ol_title:            'Offering Letter',
    ol_sub:              'Manage price offer letters (SPH) to clients',
    ol_new:              '+ New Letter',

    // Sales Order
    so_title:            'Sales Order',
    so_sub:              'Sales to Customer — delivery commitment to the buyer',
    so_new:              '+ New SO',
    so_desc:             'A Sales Order formalises a confirmed sale to a client. It draws volume from a Confirmed Stock position and triggers the approval workflow before becoming binding.',

    // Purchase Order
    po_title:            'Purchase Order',
    po_sub:              'Procurement from Supplier — cargo addition & fuel procurement',
    po_new:              '+ New Entry',
    po_desc:             'A Purchase Order is issued to a supplier to procure fuel. Once approved, it can be linked to a Stock tranche to confirm inventory.',

    // Delivery Order
    do_title:            'Delivery Order',
    do_sub:              'Delivery notes and delivery receipts',

    // MOPS
    mops_title:          'MOPS Data',
    mops_sub:            'Live MOPS pricing, JISDOR, and Pertamina bi-monthly reference',

    // Master Data
    md_title:            'Master Data',

    // Common
    btn_save:            '💾 Save',
    btn_cancel:          'Cancel',
    btn_back:            '← Back',
    btn_print:           '🖨️ Print',
    btn_edit:            'Edit',
    btn_delete:          'Del',
    btn_approval:        'Approval',
    btn_open:            'Open →',

    // Dashboard
    desc_dashboard:      'PT Global Petro Pasifik — Operations',
    dash_pending_title:  'Documents Awaiting Your Approval',
    dash_no_pending:     'No pending tasks — all documents processed.',
    dash_open:           'Open →',
    dash_available_stock:'Available Stock',
    dash_available_sub:  'confirmed positions',
    dash_committed_so:   'Committed to SO',
    dash_committed_sub:  'SO approved',
    dash_total_po:       'Total PO',
    dash_delivery:       'Delivery Orders',
    dash_delivery_sub:   'DO + BDR',
    dash_confirmed_stock:'Confirmed Stock',
    dash_recent_so:      'Recent Sales Orders',
    dash_view_all:       'View All →',
    dash_no_stock:       'No confirmed stock yet.',
    dash_no_so:          'No sales orders yet.',
    dash_loading:        'Loading…',
    lbl_status:          'Status',
    lbl_date:            'Date',
    lbl_client:          'Client',
    lbl_vendor:          'Vendor',
    lbl_total:           'Total',
  },

  id: {
    // Sidebar nav
    nav_dashboard:       'Dashboard',
    nav_stock:           'Stok',
    nav_calculator:      'Kalkulator',
    nav_offering_letter: 'Surat Penawaran',
    nav_sales_order:     'Sales Order',
    nav_purchase_order:  'Purchase Order',
    nav_delivery_order:  'Delivery Order',
    nav_mops:            'Data MOPS',
    nav_master_data:     'Master Data',
    nav_corporate:       'Korporat',
    nav_clients:         'Klien',
    nav_suppliers:       'Supplier',
    nav_products:        'Produk',
    nav_facilities:      'Fasilitas',
    nav_settings:        'Pengaturan',
    nav_change_pw:       'Ganti Password',
    nav_logout:          'Keluar',
    nav_guide:           'Panduan',
    nav_manual:          'Manual',

    // Dashboard
    dash_title:          'Dashboard',
    dash_sub:            'PT Global Petro Pasifik',
    dash_no_tasks:       'Tidak ada tugas tertunggak — semua dokumen telah diproses.',
    dash_pending_title:  'Dokumen Menunggu Persetujuan Anda',
    dash_confirmed_stock:'Stok Confirmed',
    dash_committed_so:   'Terikat SO',
    dash_total_po:       'Total PO',
    dash_delivery:       'Delivery Orders',
    dash_recent_so:      'Sales Order Terbaru',
    dash_view_all:       'Lihat Semua →',
    dash_empty_stock:    'Belum ada stok confirmed.',
    dash_empty_so:       'Belum ada Sales Order.',

    // Stock
    stock_title:         'Stok',
    stock_sub:           'Manajemen posisi kargo & supply tranches',
    stock_new:           '+ New Position',
    stock_new_tranche:   '+ Add Tranche',
    stock_link_po:       '🔗 Link PO',
    stock_calc:          '🧮 Kalkulasi',

    // Calculator
    calc_title:          'Kalkulator',
    calc_sub:            'Analisis P&L — harga blended, cost of money, margin',
    calc_to_ol:          '📄 Buat Surat Penawaran',
    calc_save:           '💾 Simpan Kalkulasi',

    // Offering Letter
    ol_title:            'Surat Penawaran',
    ol_sub:              'Kelola surat penawaran harga (SPH) ke klien',
    ol_new:              '+ New Letter',

    // Sales Order
    so_title:            'Sales Order',
    so_sub:              'Penjualan ke Klien — komitmen pengiriman ke pembeli',
    so_new:              '+ SO Baru',
    so_desc:             'Sales Order mencatat komitmen penjualan yang telah disepakati dengan klien. SO menarik volume dari Stok Confirmed dan melewati alur persetujuan sebelum berlaku mengikat.',

    // Purchase Order
    po_title:            'Purchase Order',
    po_sub:              'Pembelian dari Supplier — pengadaan BBM & penambahan kargo',
    po_new:              '+ New Entry',
    po_desc:             'Purchase Order diterbitkan ke supplier untuk pengadaan BBM. Setelah disetujui, PO dapat dihubungkan ke tranche stok sebagai konfirmasi inventaris.',

    // Delivery Order
    do_title:            'Delivery Order',
    do_sub:              'Surat jalan dan berita acara pengiriman',

    // MOPS
    mops_title:          'Data MOPS',
    mops_sub:            'Harga MOPS, JISDOR, dan referensi harga Pertamina dua mingguan',

    // Master Data
    md_title:            'Master Data',

    // Common
    btn_save:            '💾 Simpan',
    btn_cancel:          'Batal',
    btn_back:            '← Kembali',
    btn_print:           '🖨️ Cetak',
    btn_edit:            'Edit',
    btn_delete:          'Del',
    btn_approval:        'Approval',
    btn_open:            'Buka →',

    // Dashboard
    desc_dashboard:      'PT Global Petro Pasifik — Operasional',
    dash_pending_title:  'Dokumen Menunggu Persetujuan Anda',
    dash_no_pending:     'Tidak ada tugas tertunggak — semua dokumen sudah diproses.',
    dash_open:           'Buka →',
    dash_available_stock:'Stok Tersedia',
    dash_available_sub:  'stok confirmed',
    dash_committed_so:   'Terikat SO',
    dash_committed_sub:  'SO disetujui',
    dash_total_po:       'Total PO',
    dash_delivery:       'Delivery Orders',
    dash_delivery_sub:   'DO + BDR',
    dash_confirmed_stock:'Stok Confirmed',
    dash_recent_so:      'Sales Order Terbaru',
    dash_view_all:       'Lihat Semua →',
    dash_no_stock:       'Belum ada stok confirmed.',
    dash_no_so:          'Belum ada Sales Order.',
    dash_loading:        'Memuat…',
    lbl_status:          'Status',
    lbl_date:            'Tanggal',
    lbl_client:          'Klien',
    lbl_vendor:          'Vendor',
    lbl_total:           'Total',
  },
};

export const DEFAULT_LANG = 'en';
export const LANG_KEY = 'gpp_lang';

export const getLang = () => localStorage.getItem(LANG_KEY) || DEFAULT_LANG;
export const setLang = (l) => localStorage.setItem(LANG_KEY, l);

export const t = (lang, key) => translations[lang]?.[key] ?? translations.en[key] ?? key;
