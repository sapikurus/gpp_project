import { useState } from 'react';
import { useApp } from '../../App.jsx';
import { patchData } from '../../firebase.js';

const Section = ({ title, children }) => (
  <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
    <h2 className="font-semibold text-gray-700 text-base mb-4 border-b pb-2">{title}</h2>
    {children}
  </div>
);

const Field = ({ label, value, onChange, type = 'text', placeholder = '' }) => (
  <div>
    <label className="block text-xs text-gray-500 mb-1">{label}</label>
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
    />
  </div>
);

// Generic list editor for customers / vendors / vessels / products
const ListEditor = ({ title, items, schema, onChange }) => {
  const [newItem, setNewItem] = useState(() => Object.fromEntries(schema.map(f => [f.key, ''])));
  const [editing, setEditing] = useState(null); // index

  const add = () => {
    if (!newItem[schema[0].key]) return;
    const updated = [...items, { ...newItem, id: Date.now().toString() }];
    onChange(updated);
    setNewItem(Object.fromEntries(schema.map(f => [f.key, ''])));
  };

  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));

  const saveEdit = () => {
    const updated = items.map((item, i) => i === editing ? { ...editing, ...item } : item);
    setEditing(null);
    onChange(updated);
  };

  return (
    <div className="mb-6">
      <h3 className="font-medium text-sm text-gray-600 mb-3">{title}</h3>

      {/* Add row */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {schema.map(f => (
          <input
            key={f.key}
            type="text"
            placeholder={f.label}
            value={newItem[f.key]}
            onChange={e => setNewItem(p => ({ ...p, [f.key]: e.target.value }))}
            className="flex-1 min-w-[120px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        ))}
        <button onClick={add}
          className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 shrink-0">
          + Tambah
        </button>
      </div>

      {/* List */}
      <div className="space-y-2">
        {items.length === 0 && (
          <p className="text-gray-400 text-xs italic">Belum ada data.</p>
        )}
        {items.map((item, i) => (
          <div key={item.id || i} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
            <div className="flex-1 flex gap-4 flex-wrap">
              {schema.map(f => (
                <span key={f.key} className="text-sm text-gray-700">
                  <span className="text-gray-400 text-xs">{f.label}: </span>{item[f.key]}
                </span>
              ))}
            </div>
            <button onClick={() => remove(i)}
              className="text-red-400 hover:text-red-600 text-xs">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function MasterData() {
  const { appData, reload } = useApp();
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  // Local state mirrors appData
  const [company, setCompany]         = useState(appData?.company     || {});
  const [rates,   setRates]           = useState(appData?.rates       || { ppn: 11, bankRate: 6.5 });
  const [signatories, setSign]        = useState(appData?.signatories || {});
  const [customers, setCustomers]     = useState(appData?.customers   || []);
  const [vendors,   setVendors]       = useState(appData?.vendors     || []);
  const [vessels,   setVessels]       = useState(appData?.vessels     || []);
  const [products,  setProducts]      = useState(appData?.products    || []);

  const setC = (key) => (val) => setCompany(p => ({ ...p, [key]: val }));
  const setR = (key) => (val) => setRates(p => ({ ...p, [key]: val }));
  const setS = (key) => (val) => setSign(p => ({ ...p, [key]: val }));

  const save = async () => {
    setSaving(true);
    try {
      await patchData({ company, rates, signatories, customers, vendors, vessels, products });
      await reload();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Master Data</h1>
          <p className="text-gray-500 text-sm mt-1">Konfigurasi data induk GPP</p>
        </div>
        <button onClick={save} disabled={saving}
          className="bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-60 transition-colors flex items-center gap-2">
          {saving ? '⏳ Menyimpan…' : saved ? '✅ Tersimpan' : '💾 Simpan Semua'}
        </button>
      </div>

      {/* Company */}
      <Section title="🏢 Profil Perusahaan">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Nama Perusahaan"  value={company.name     || ''} onChange={setC('name')} />
          <Field label="NPWP"             value={company.npwp     || ''} onChange={setC('npwp')} />
          <Field label="Alamat 1"         value={company.address1 || ''} onChange={setC('address1')} />
          <Field label="Alamat 2"         value={company.address2 || ''} onChange={setC('address2')} />
          <Field label="Telepon"          value={company.phone    || ''} onChange={setC('phone')} />
          <Field label="Email"            value={company.email    || ''} onChange={setC('email')} />
        </div>
      </Section>

      {/* Rates */}
      <Section title="📊 Tarif & Suku Bunga">
        <div className="grid grid-cols-2 gap-4">
          <Field label="PPN (%)"              value={rates.ppn      || ''} onChange={setR('ppn')}      type="number" />
          <Field label="Suku Bunga Bank (%)"  value={rates.bankRate  || ''} onChange={setR('bankRate')} type="number" />
        </div>
      </Section>

      {/* Signatories */}
      <Section title="✍️ Penandatangan Dokumen">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Prepared By"    value={signatories.preparedBy   || ''} onChange={setS('preparedBy')} />
          <Field label="Approved By"    value={signatories.approvedBy   || ''} onChange={setS('approvedBy')} />
          <Field label="Petugas Lapangan" value={signatories.fieldOfficer || ''} onChange={setS('fieldOfficer')} />
        </div>
      </Section>

      {/* Customers */}
      <Section title="👥 Data Customer">
        <ListEditor
          title="Daftar Customer"
          items={customers}
          schema={[
            { key: 'name',    label: 'Nama' },
            { key: 'address', label: 'Alamat' },
            { key: 'npwp',    label: 'NPWP' },
          ]}
          onChange={setCustomers}
        />
      </Section>

      {/* Vendors */}
      <Section title="🏭 Data Vendor / Pemasok">
        <ListEditor
          title="Daftar Vendor"
          items={vendors}
          schema={[
            { key: 'name',    label: 'Nama' },
            { key: 'address', label: 'Alamat' },
            { key: 'npwp',    label: 'NPWP' },
          ]}
          onChange={setVendors}
        />
      </Section>

      {/* Vessels */}
      <Section title="🚢 Data Kapal / SPOB">
        <ListEditor
          title="Daftar Kapal"
          items={vessels}
          schema={[
            { key: 'name', label: 'Nama Kapal/SPOB' },
            { key: 'type', label: 'Tipe' },
          ]}
          onChange={setVessels}
        />
      </Section>

      {/* Products */}
      <Section title="⛽ Data Produk">
        <ListEditor
          title="Daftar Produk"
          items={products}
          schema={[
            { key: 'name', label: 'Nama Produk' },
            { key: 'unit', label: 'Satuan' },
          ]}
          onChange={setProducts}
        />
      </Section>
    </div>
  );
}
