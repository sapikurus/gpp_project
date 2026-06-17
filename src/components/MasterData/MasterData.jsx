import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useApp } from '../../App.jsx';
import { patchField, patchData, exportBackup, importBackup, requestPushNotification, getFCMDiagnostics, testCloudFunction } from '../../firebase.js';
import { ALL_CONFIGURABLE_ROUTES, DEFAULT_ROLE_MENU } from '../../utils/approvalUtils.js';
import * as XLSX from 'xlsx';

const F = ({ label, value, onChange, type = 'text', placeholder = '', step }) => (
  <div>
    <label className="block text-xs text-gray-500 mb-1">{label}</label>
    <input type={type} step={step} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
  </div>
);

const Card = ({ title, children, action }) => (
  <div className="bg-white rounded-xl shadow-sm p-5 mb-4">
    <div className="flex items-center justify-between mb-4 border-b pb-2">
      <h2 className="font-semibold text-gray-700 text-sm">{title}</h2>
      {action}
    </div>
    {children}
  </div>
);

const SaveBtn = ({ onSave, saving, saved }) => (
  <div className="flex justify-end mb-4">
    <button onClick={onSave} disabled={saving}
      className="bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-60">
      {saving ? '⏳ Menyimpan…' : saved ? '✅ Tersimpan' : '💾 Simpan'}
    </button>
  </div>
);

const SubTabs = ({ tabs, active, onChange }) => (
  <div className="flex gap-1 mb-5 bg-gray-100 rounded-xl p-1 flex-wrap">
    {tabs.map(({ key, label, icon }) => (
      <button key={key} onClick={() => onChange(key)}
        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
          active === key ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
        }`}>
        <span>{icon}</span>{label}
      </button>
    ))}
  </div>
);

// ─── Corporate ────────────────────────────────────────────────────────────────
function Corporate() {
  const { appData, reload } = useApp();
  const [sub, setSub] = useState('general');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [headOffice, setHO] = useState(appData?.headOffice || {
    name: appData?.company?.name || 'PT Global Petro Pasifik',
    address: appData?.company?.address1 || '',
    npwp: appData?.company?.npwp || '',
    phone: appData?.company?.phone || '',
    email: appData?.company?.email || '',
  });
  const [branches, setBranches]   = useState(appData?.branches || []);
  const [sign, setSign] = useState(
    // Migrate old single-field format to new list format
    Array.isArray(appData?.signatories)
      ? appData.signatories
      : appData?.signatories?.preparedBy
        ? [
            { id: '1', name: appData.signatories.preparedBy, jabatan: '', role: 'staff' },
            ...(appData.signatories.approvedBy ? [{ id: '2', name: appData.signatories.approvedBy, jabatan: 'Direktur', role: 'director' }] : []),
          ]
        : []
  );

  const addSignatory  = () => setSign(p => [...p, { id: Date.now().toString(), name: '', jabatan: '', role: 'director' }]);
  const delSignatory  = id => setSign(p => p.filter(x => x.id !== id));
  const updSignatory  = (id, k, v) => setSign(p => p.map(x => x.id === id ? { ...x, [k]: v } : x));  const [banks,    setBanks]      = useState(appData?.banks || (appData?.banking ? [{ ...appData.banking, id: '1', isPrimary: true }] : []));
  const [rates,    setRates]      = useState(appData?.rates || { ppn: 11, pph: 0.3, bphMigas: 0.25, bankRate: 6.5 });
  const [provinces,setProvinces]  = useState(appData?.pbbkbProvinces || []);
  const [newProv,  setNP]         = useState({ name: '', rate: '' });

  const sho = k => v => setHO(p => ({ ...p, [k]: v }));
  const sr  = k => v => setRates(p => ({ ...p, [k]: v }));

  const addBranch = () => setBranches(p => [...p, { id: Date.now().toString(), name: '', address: '', npwp: '', phone: '', email: '' }]);
  const delBranch = i => setBranches(p => p.filter((_, idx) => idx !== i));
  const updBranch = (i, k, v) => setBranches(p => p.map((x, idx) => idx === i ? { ...x, [k]: v } : x));

  const addBank   = () => setBanks(p => [...p, { id: Date.now().toString(), bankName: '', accountNo: '', accountName: '', branch: '', isPrimary: false }]);
  const delBank   = i => setBanks(p => p.filter((_, idx) => idx !== i));
  const updBank   = (i, k, v) => setBanks(p => p.map((x, idx) => idx === i ? { ...x, [k]: v } : x));
  const setPrimary = i => setBanks(p => p.map((x, idx) => ({ ...x, isPrimary: idx === i })));

  const saveAll = async () => {
    setSaving(true);
    try {
      await patchData({
        headOffice, branches,
        signatories: sign,   // now an array [{id, name, jabatan, role}]
        banks, rates, pbbkbProvinces: provinces,
        company: { name: headOffice.name, address1: headOffice.address, npwp: headOffice.npwp, phone: headOffice.phone, email: headOffice.email },
        banking: banks.find(b => b.isPrimary) || banks[0] || {},
      });
      await reload(); setSaved(true); setTimeout(() => setSaved(false), 2500);
    } finally { setSaving(false); }
  };

  return (
    <div>
      <SaveBtn onSave={saveAll} saving={saving} saved={saved} />
      <SubTabs active={sub} onChange={setSub} tabs={[
        { key: 'general', label: 'General Info',  icon: '🏢' },
        { key: 'bank',    label: 'Bank Info',      icon: '🏦' },
        { key: 'rates',   label: 'Rates & PBBKB', icon: '📊' },
      ]} />

      {sub === 'general' && <>
        <Card title="🏢 Head Office">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <F label="Nama Perusahaan" value={headOffice.name || ''} onChange={sho('name')} />
            <F label="NPWP"           value={headOffice.npwp || ''} onChange={sho('npwp')} />
            {/* Multiline address */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Alamat</label>
              <textarea value={headOffice.address || ''} onChange={e => sho('address')(e.target.value)}
                rows={3} placeholder={"Jl. Central Raya No.17\nCentral Sukajadi, Batam\n29432"}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"/>
              <p className="text-[10px] text-gray-400 mt-0.5">Each line will appear as a separate line in printed documents.</p>
            </div>
            <F label="Telepon" value={headOffice.phone || ''} onChange={sho('phone')} />
            <F label="Email"   value={headOffice.email || ''} onChange={sho('email')} />
          </div>
        </Card>

        <Card title="🏬 Kantor Cabang" action={
          <button onClick={addBranch} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-medium">
            + Tambah Cabang
          </button>
        }>
          {branches.length === 0
            ? <p className="text-gray-400 text-xs italic text-center py-4">Belum ada cabang.</p>
            : <div className="space-y-4">
                {branches.map((b, i) => (
                  <div key={b.id || i} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Cabang {i + 1}</span>
                      <button onClick={() => delBranch(i)} className="text-red-400 hover:text-red-600 text-xs">✕ Hapus</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[['name','Nama Cabang'],['npwp','NPWP Cabang'],['phone','Telepon'],['email','Email']].map(([k, l]) => (
                        <div key={k}>
                          <label className="block text-xs text-gray-500 mb-1">{l}</label>
                          <input type="text" value={b[k] || ''} onChange={e => updBranch(i, k, e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white" />
                        </div>
                      ))}
                      <div className="md:col-span-2">
                        <label className="block text-xs text-gray-500 mb-1">Alamat</label>
                        <textarea value={b.address || ''} onChange={e => updBranch(i, 'address', e.target.value)}
                          rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white resize-none"/>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
          }
        </Card>

        <Card title="✍️ Signatories" action={
          <button onClick={addSignatory} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-medium">
            + Add Signatory
          </button>
        }>
          <div className="text-xs text-gray-400 mb-4 space-y-1">
            <p>Store the names and titles of authorized signatories for printed documents (OL, PO, SO, DO).</p>
            <p><b>How it works:</b> When printing a document, the system picks the signatory whose <b>Role</b> matches the document context — the preparing staff's name goes in "Prepared by", the director's name goes in "Approved by".</p>
          </div>

          {sign.length === 0
            ? <p className="text-gray-400 text-xs italic text-center py-4">No signatories yet. Add at least one Director.</p>
            : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Full Name','Jabatan / Title','Role',''].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {sign.map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <input type="text" value={s.name || ''} onChange={e => updSignatory(s.id, 'name', e.target.value)}
                          placeholder="e.g. Nico Yonathan"
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                      </td>
                      <td className="px-3 py-2">
                        <input type="text" value={s.jabatan || ''} onChange={e => updSignatory(s.id, 'jabatan', e.target.value)}
                          placeholder="e.g. Direktur"
                          className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
                      </td>
                      <td className="px-3 py-2">
                        <select value={s.role || 'director'} onChange={e => updSignatory(s.id, 'role', e.target.value)}
                          className="border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white">
                          <option value="superadmin">Super Admin</option>
                          <option value="director">Director</option>
                          <option value="manager">Manager</option>
                          <option value="staff">Staff</option>
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => delSignatory(s.id)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-xs text-blue-700 space-y-1">
            <p><b>"Prepared by"</b> on printed docs → auto-filled from the logged-in user's matching signatory entry (matched by their role). If no match, shows their email.</p>
            <p><b>"Approved by"</b> → always uses the Director or Super Admin signatory entry.</p>
            <p><b>Petugas Lapangan</b> → input directly on each Delivery Order — no need to store here.</p>
          </div>
        </Card>
      </>}

      {sub === 'bank' && <>
        <Card title="🏦 Rekening Bank" action={
          <button onClick={addBank} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-medium">
            + Tambah Rekening
          </button>
        }>
          {banks.length === 0
            ? <p className="text-gray-400 text-xs italic text-center py-4">Belum ada rekening.</p>
            : <div className="space-y-4">
                {banks.map((b, i) => (
                  <div key={b.id || i} className={`border rounded-xl p-4 ${b.isPrimary ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-gray-50'}`}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-500 uppercase">Rekening {i + 1}</span>
                        {b.isPrimary && <span className="bg-blue-700 text-white text-[10px] px-2 py-0.5 rounded-full font-semibold">UTAMA</span>}
                      </div>
                      <div className="flex items-center gap-3">
                        {!b.isPrimary && <button onClick={() => setPrimary(i)} className="text-xs text-blue-600 hover:underline">Jadikan Utama</button>}
                        <button onClick={() => delBank(i)} className="text-red-400 hover:text-red-600 text-xs">✕ Hapus</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {[['bankName','Nama Bank'],['accountNo','No. Rekening'],['accountName','Atas Nama'],['branch','Cabang Bank']].map(([k, l]) => (
                        <div key={k}>
                          <label className="block text-xs text-gray-500 mb-1">{l}</label>
                          <input type="text" value={b[k] || ''} onChange={e => updBank(i, k, e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white" />
                        </div>
                      ))}
                    </div>
                    {b.bankName && b.accountNo && (
                      <div className="mt-3 bg-white border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700">
                        <b>{b.bankName}</b> — {b.accountNo} a/n <b>{b.accountName}</b>{b.branch ? ` (Cab. ${b.branch})` : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
          }
        </Card>
      </>}

      {sub === 'rates' && <>
        <Card title="📊 Tarif Global">
          <div className="grid grid-cols-2 gap-4">
            <F label="PPN (%)"                  value={rates.ppn      || ''} onChange={sr('ppn')}      type="number" step="0.1" />
            <F label="Suku Bunga Bank (% p.a.)" value={rates.bankRate || ''} onChange={sr('bankRate')} type="number" step="0.1" />
            <F label="PPH (%)"                  value={rates.pph      || ''} onChange={sr('pph')}      type="number" step="0.1" />
            <F label="BPH Migas (%)"            value={rates.bphMigas || ''} onChange={sr('bphMigas')} type="number" step="0.1" />
          </div>
        </Card>

        <Card title="🗺️ PBBKB per Provinsi">
          <p className="text-xs text-gray-400 mb-4">Centang <b>GPP Terdaftar</b> jika GPP sudah terdaftar di Bapenda provinsi tersebut (wajib pungut).</p>
          <div className="flex gap-2 mb-4 flex-wrap">
            <input type="text" placeholder="Nama Provinsi" value={newProv.name}
              onChange={e => setNP(p => ({ ...p, name: e.target.value }))}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            <input type="number" placeholder="Rate %" step="0.1" value={newProv.rate}
              onChange={e => setNP(p => ({ ...p, rate: e.target.value }))}
              className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            <button onClick={() => {
              if (!newProv.name) return;
              setProvinces(p => [...p, { ...newProv, registered: false, id: Date.now().toString() }]);
              setNP({ name: '', rate: '' });
            }} className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-800">+ Tambah</button>
          </div>
          {provinces.length === 0
            ? <p className="text-gray-400 text-xs italic">Belum ada provinsi.</p>
            : (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50"><tr>
                  <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-semibold">Provinsi</th>
                  <th className="text-center px-4 py-2.5 text-xs text-gray-500 font-semibold w-28">Rate (%)</th>
                  <th className="text-center px-4 py-2.5 text-xs text-gray-500 font-semibold w-36">GPP Terdaftar</th>
                  <th className="w-10" />
                </tr></thead>
                <tbody className="divide-y divide-gray-100">
                  {provinces.map((p, i) => (
                    <tr key={p.id || i} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{p.name}</td>
                      <td className="px-4 py-2.5 text-center">
                        <input type="number" step="0.1" value={p.rate}
                          onChange={e => setProvinces(arr => arr.map((x, idx) => idx === i ? { ...x, rate: e.target.value } : x))}
                          className="w-20 border border-gray-200 rounded px-2 py-1 text-sm text-center focus:outline-none focus:ring-1 focus:ring-blue-300" />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button onClick={() => setProvinces(arr => arr.map((x, idx) => idx === i ? { ...x, registered: !x.registered } : x))}
                          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${p.registered ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                          {p.registered ? '✅ Terdaftar' : '— Belum'}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <button onClick={() => setProvinces(arr => arr.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </>}
    </div>
  );
}

// ─── Generic list editor ──────────────────────────────────────────────────────
const ListEditor = ({ items, schema, onChange }) => {
  const blank = () => Object.fromEntries([['id', Date.now().toString() + Math.random()], ...schema.map(f => [f.key, ''])]);
  const [row, setRow] = useState(blank());
  const add = () => { if (!row[schema[0].key]) return; onChange([...items, { ...row }]); setRow(blank()); };
  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap">
        {schema.map(f => (
          <input key={f.key} type="text" placeholder={f.label} value={row[f.key]}
            onChange={e => setRow(p => ({ ...p, [f.key]: e.target.value }))}
            className="flex-1 min-w-[100px] border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
        ))}
        <button onClick={add} className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-800 shrink-0">+ Tambah</button>
      </div>
      {items.length === 0 && <p className="text-gray-400 text-xs italic">Belum ada data.</p>}
      <div className="space-y-2">
        {items.map((item, i) => (
          <div key={item.id || i} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
            <div className="flex-1 flex gap-3 flex-wrap">
              {schema.map(f => <span key={f.key} className="text-sm text-gray-700"><span className="text-gray-400 text-xs">{f.label}: </span>{item[f.key]}</span>)}
            </div>
            <button onClick={() => onChange(items.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 text-xs shrink-0">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
};

function useSave(field, getData, reload, appData) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    // Guard: never save if appData hasn't loaded — prevents wiping real data
    if (!appData) { alert('Data belum selesai dimuat. Tunggu sebentar lalu coba lagi.'); return; }
    setSaving(true);
    try { await patchField(field, getData()); await reload(); setSaved(true); setTimeout(() => setSaved(false), 2500); }
    finally { setSaving(false); }
  };
  return { save, saving, saved };
}

// ─── ClientForm — defined at MODULE LEVEL to prevent remount on parent re-render ──
// If defined inside Clients(), React creates a new component type on every keystroke
// → unmount/remount → autoFocus fires → cursor jumps back to name field
const IF = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white';

function ClientForm({ client, onChange, onSave, onCancel, saveLabel }) {
  return (
    <div className="border border-blue-200 rounded-xl p-4 bg-blue-50 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Nama Perusahaan *</label>
          <input type="text" value={client.name} onChange={e => onChange('name', e.target.value)}
            placeholder="PT. Contoh Tbk."
            className={IF}/>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Kode Client</label>
          <input type="text" value={client.code||''} onChange={e => onChange('code', e.target.value.toUpperCase())}
            placeholder="PTRO" maxLength={10}
            className={IF + ' font-mono uppercase'}/>
          <p className="text-[10px] text-gray-400 mt-0.5">Digunakan dalam nomor surat</p>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">NPWP</label>
          <input type="text" value={client.npwp||''} onChange={e => onChange('npwp', e.target.value)}
            placeholder="00.000.000.0-000.000" className={IF}/>
        </div>
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs text-gray-500">Alamat</label>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400">Baris:</span>
              <button type="button" onClick={() => onChange('addressRows', Math.max(1, (client.addressRows||3) - 1))}
                className="w-5 h-5 rounded border border-gray-300 text-xs flex items-center justify-center hover:bg-gray-100 bg-white">−</button>
              <span className="text-xs text-gray-600 w-4 text-center">{client.addressRows||3}</span>
              <button type="button" onClick={() => onChange('addressRows', Math.min(8, (client.addressRows||3) + 1))}
                className="w-5 h-5 rounded border border-gray-300 text-xs flex items-center justify-center hover:bg-gray-100 bg-white">+</button>
            </div>
          </div>
          <textarea value={client.address||''} onChange={e => onChange('address', e.target.value)}
            rows={client.addressRows||3}
            placeholder={"Gedung Contoh, lt 6. Unit 6-10\nJl. Pemuda no 10\nJakarta 14210"}
            className={IF + ' resize-none font-mono'}/>
          <p className="text-[10px] text-gray-400 mt-0.5">Setiap baris akan muncul terpisah di surat penawaran</p>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Kontak / PIC</label>
          <input type="text" value={client.contact||''} onChange={e => onChange('contact', e.target.value)}
            placeholder="Nama PIC" className={IF}/>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Email</label>
          <input type="email" value={client.email||''} onChange={e => onChange('email', e.target.value)}
            placeholder="email@perusahaan.com" className={IF}/>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">TOP Default (hari)</label>
          <input type="number" value={client.top||''} onChange={e => onChange('top', e.target.value)}
            placeholder="45" className={IF}/>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onSave} disabled={!client.name}
          className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
          {saveLabel || '+ Tambah'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-white">
          Batal
        </button>
      </div>
    </div>
  );
}

// ─── SupplierForm — same pattern, module level ─────────────────────────────────
function SupplierForm({ supplier, onChange, onSave, onCancel, saveLabel }) {
  return (
    <div className="border border-blue-200 rounded-xl p-4 bg-blue-50 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs text-gray-500 mb-1">Nama Perusahaan *</label>
          <input type="text" value={supplier.name||''} onChange={e => onChange('name', e.target.value)}
            placeholder="PT. Contoh Tbk." className={IF}/>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">NPWP</label>
          <input type="text" value={supplier.npwp||''} onChange={e => onChange('npwp', e.target.value)}
            placeholder="00.000.000.0-000.000" className={IF}/>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Kontak / PIC</label>
          <input type="text" value={supplier.contact||''} onChange={e => onChange('contact', e.target.value)}
            placeholder="Nama PIC" className={IF}/>
        </div>
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs text-gray-500">Alamat</label>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400">Baris:</span>
              <button type="button" onClick={() => onChange('addressRows', Math.max(1, (supplier.addressRows||2) - 1))}
                className="w-5 h-5 rounded border border-gray-300 text-xs flex items-center justify-center hover:bg-gray-100 bg-white">−</button>
              <span className="text-xs text-gray-600 w-4 text-center">{supplier.addressRows||2}</span>
              <button type="button" onClick={() => onChange('addressRows', Math.min(8, (supplier.addressRows||2) + 1))}
                className="w-5 h-5 rounded border border-gray-300 text-xs flex items-center justify-center hover:bg-gray-100 bg-white">+</button>
            </div>
          </div>
          <textarea value={supplier.address||''} onChange={e => onChange('address', e.target.value)}
            rows={supplier.addressRows||2}
            placeholder={"Jl. Contoh No. 1\nJakarta Pusat 10110"}
            className={IF + ' resize-none font-mono'}/>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Email</label>
          <input type="email" value={supplier.email||''} onChange={e => onChange('email', e.target.value)}
            placeholder="email@supplier.com" className={IF}/>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Telepon</label>
          <input type="text" value={supplier.phone||''} onChange={e => onChange('phone', e.target.value)}
            placeholder="+62 21 xxx xxxx" className={IF}/>
        </div>
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onSave} disabled={!supplier.name}
          className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
          {saveLabel || '+ Tambah'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-white">
          Batal
        </button>
      </div>
    </div>
  );
}

function Clients() {
  const { appData, reload } = useApp();
  const [items, setItems]   = useState(appData?.clients || []);
  const [view, setView]     = useState('list'); // 'list' | 'form'
  const [formData, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (appData?.clients) setItems(appData.clients); }, [appData]);

  const blank = () => ({ id: Date.now().toString()+Math.random(), name:'', code:'', address:'', npwp:'', contact:'', email:'', top:'', addressRows:3 });

  const openNew  = () => { setForm(blank()); setView('form'); };
  const openEdit = (c) => { setForm({ ...c }); setView('form'); };
  const cancel   = () => { setView('list'); setForm(null); };

  const saveEntry = async () => {
    if (!formData?.name) return;
    if (!appData) { alert('Data belum dimuat, coba lagi.'); return; }
    setSaving(true);
    try {
      const isEdit = items.some(x => x.id === formData.id);
      const next   = isEdit ? items.map(x => x.id === formData.id ? { ...formData } : x)
                             : [...items, { ...formData }];
      await patchField('clients', next);
      await reload();
      setItems(next);
      setView('list');
      setForm(null);
    } finally { setSaving(false); }
  };

  const removeClient = async (id) => {
    if (!confirm('Hapus client ini?')) return;
    const next = items.filter(x => x.id !== id);
    await patchField('clients', next);
    setItems(next);
    await reload();
  };

  // ── Form view ──
  if (view === 'form') return (
    <Card title={formData && items.some(x=>x.id===formData.id) ? '✏️ Edit Client' : '➕ Client Baru'}>
      <ClientForm
        client={formData || blank()}
        onChange={(k, v) => setForm(p => ({ ...p, [k]: v }))}
        onSave={null}
        onCancel={null}
        saveLabel=""
      />
      <div className="flex gap-2 mt-4">
        <button onClick={saveEntry} disabled={saving || !formData?.name}
          className="bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
          {saving ? '⏳ Menyimpan…' : '💾 Simpan'}
        </button>
        <button onClick={cancel}
          className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          Batal
        </button>
      </div>
    </Card>
  );

  // ── Template download ──
  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Nama Perusahaan *', 'Kode Client', 'NPWP', 'Alamat Baris 1', 'Alamat Baris 2', 'Alamat Baris 3', 'Kontak / PIC', 'Email', 'TOP Default (hari)'],
      ['PT. Contoh Tbk.', 'CTOH', '00.000.000.0-000.000', 'Gedung Contoh, lt 5', 'Jl. Jendral Sudirman No. 1', 'Jakarta Pusat 10220', 'Budi Santoso', 'budi@contoh.co.id', '45'],
    ]);
    ws['!cols'] = [30,16,22,28,28,22,20,26,10].map(w=>({wch:w}));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clients');
    XLSX.writeFile(wb, 'GPP_Client_Template.xlsx');
  };

  // ── Excel import ──
  const importExcel = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const ab   = await file.arrayBuffer();
      const wb   = XLSX.read(ab);
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
      if (rows.length < 2) { alert('No data rows found.'); return; }
      // Skip header row (row 0)
      const imported = rows.slice(1).filter(r => r[0]).map(r => ({
        id:          Date.now().toString() + Math.random(),
        name:        String(r[0] || '').trim(),
        code:        String(r[1] || '').trim().toUpperCase(),
        npwp:        String(r[2] || '').trim(),
        address:     [r[3],r[4],r[5]].map(v=>String(v||'').trim()).filter(Boolean).join('\n'),
        contact:     String(r[6] || '').trim(),
        email:       String(r[7] || '').trim(),
        top:         String(r[8] || '').trim(),
        addressRows: [r[3],r[4],r[5]].filter(v=>String(v||'').trim()).length || 1,
      }));
      if (imported.length === 0) { alert('No valid rows found.'); return; }
      if (!confirm(`Import ${imported.length} clients? Existing clients will be kept.`)) return;
      const merged = [...items, ...imported.filter(imp => !items.find(ex => ex.name === imp.name))];
      await patchField('clients', merged);
      await reload();
      alert(`✅ Imported ${imported.length} clients.`);
    } catch(err) { alert('Import failed: ' + err.message); }
    e.target.value = '';
  };

  // ── List view ──
  return (
    <Card title="👥 Client Database"
      action={
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={downloadTemplate}
            className="text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 font-medium">
            ⬇ Template
          </button>
          <label className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-medium cursor-pointer">
            📥 Import Excel
            <input type="file" accept=".xlsx,.xls,.csv" onChange={importExcel} className="hidden"/>
          </label>
          <button onClick={openNew}
            className="bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-800">
            + New Entry
          </button>
        </div>
      }>
      <p className="text-xs text-gray-400 mb-4">
        Kode client digunakan dalam nomor surat. Download template Excel, isi, lalu import. Data disimpan langsung ke Firestore.
      </p>
      {items.length === 0
        ? <p className="text-gray-400 text-xs italic text-center py-6">Belum ada client. Klik "+ New Entry" atau import dari Excel.</p>
        : <div className="space-y-2">
            {items.map(client => (
              <div key={client.id} className="border border-gray-100 rounded-xl p-4 hover:bg-gray-50 hover:border-blue-100 transition-colors">
                <div className="flex items-start justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800 text-sm">{client.name}</span>
                    {client.code && <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{client.code}</span>}
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => openEdit(client)} className="text-xs text-blue-600 border border-blue-100 px-2 py-0.5 rounded hover:bg-blue-50">✏️ Edit</button>
                    <button onClick={() => removeClient(client.id)} className="text-xs text-red-400 border border-red-100 px-2 py-0.5 rounded hover:bg-red-50">✕</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-500">
                  {client.address && <div className="col-span-2"><span className="text-gray-400">Alamat: </span>{client.address.split('\n').filter(Boolean).join(', ')}</div>}
                  {client.npwp    && <div><span className="text-gray-400">NPWP: </span>{client.npwp}</div>}
                  {client.contact && <div><span className="text-gray-400">PIC: </span>{client.contact}</div>}
                  {client.email   && <div><span className="text-gray-400">Email: </span>{client.email}</div>}
                  {client.top     && <div><span className="text-gray-400">TOP: </span>{client.top} hari</div>}
                </div>
              </div>
            ))}
          </div>
      }
    </Card>
  );
}

function Suppliers() {
  const { appData, reload } = useApp();
  const [items, setItems]   = useState(appData?.suppliers || []);
  const [view, setView]     = useState('list');
  const [formData, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (appData?.suppliers) setItems(appData.suppliers); }, [appData]);

  const blank = () => ({ id: Date.now().toString()+Math.random(), name:'', address:'', npwp:'', contact:'', email:'', phone:'', addressRows:2 });

  const openNew  = () => { setForm(blank()); setView('form'); };
  const openEdit = (s) => { setForm({ ...s }); setView('form'); };
  const cancel   = () => { setView('list'); setForm(null); };

  const saveEntry = async () => {
    if (!formData?.name) return;
    if (!appData) { alert('Data belum dimuat, coba lagi.'); return; }
    setSaving(true);
    try {
      const isEdit = items.some(x => x.id === formData.id);
      const next   = isEdit ? items.map(x => x.id === formData.id ? { ...formData } : x)
                             : [...items, { ...formData }];
      await patchField('suppliers', next);
      await reload();
      setItems(next);
      setView('list');
      setForm(null);
    } finally { setSaving(false); }
  };

  const removeSupplier = async (id) => {
    if (!confirm('Hapus supplier ini?')) return;
    const next = items.filter(x => x.id !== id);
    await patchField('suppliers', next);
    setItems(next);
    await reload();
  };

  // ── Form view ──
  if (view === 'form') return (
    <Card title={formData && items.some(x=>x.id===formData.id) ? '✏️ Edit Supplier' : '➕ Supplier Baru'}>
      <SupplierForm
        supplier={formData || blank()}
        onChange={(k, v) => setForm(p => ({ ...p, [k]: v }))}
        onSave={null}
        onCancel={null}
        saveLabel=""
      />
      <div className="flex gap-2 mt-4">
        <button onClick={saveEntry} disabled={saving || !formData?.name}
          className="bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
          {saving ? '⏳ Menyimpan…' : '💾 Simpan'}
        </button>
        <button onClick={cancel}
          className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
          Batal
        </button>
      </div>
    </Card>
  );

  // ── List view ──
  return (
    <Card title="🏭 Supplier Database"
      action={
        <button onClick={openNew}
          className="bg-blue-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-800">
          + New Entry
        </button>
      }>
      <p className="text-xs text-gray-400 mb-4">Tersedia sebagai pilihan di Purchase Order. Data disimpan langsung ke Firestore.</p>
      {items.length === 0
        ? <p className="text-gray-400 text-xs italic text-center py-6">Belum ada supplier. Klik "+ New Entry" untuk menambahkan.</p>
        : <div className="space-y-2">
            {items.map(s => (
              <div key={s.id} className="border border-gray-100 rounded-xl p-4 hover:bg-gray-50 hover:border-blue-100 transition-colors">
                <div className="flex items-start justify-between mb-1.5">
                  <span className="font-semibold text-gray-800 text-sm">{s.name}</span>
                  <div className="flex gap-1.5">
                    <button onClick={() => openEdit(s)} className="text-xs text-blue-600 border border-blue-100 px-2 py-0.5 rounded hover:bg-blue-50">✏️ Edit</button>
                    <button onClick={() => removeSupplier(s.id)} className="text-xs text-red-400 border border-red-100 px-2 py-0.5 rounded hover:bg-red-50">✕</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-gray-500">
                  {s.address && <div className="col-span-2"><span className="text-gray-400">Alamat: </span>{s.address.split('\n').filter(Boolean).join(', ')}</div>}
                  {s.npwp    && <div><span className="text-gray-400">NPWP: </span>{s.npwp}</div>}
                  {s.contact && <div><span className="text-gray-400">PIC: </span>{s.contact}</div>}
                  {s.email   && <div><span className="text-gray-400">Email: </span>{s.email}</div>}
                  {s.phone   && <div><span className="text-gray-400">Tel: </span>{s.phone}</div>}
                </div>
              </div>
            ))}
          </div>
      }
    </Card>
  );
}


function Products() {
  const { appData, reload } = useApp();
  const [items, setItems] = useState(appData?.products || []);
  const { save, saving, saved } = useSave('products', () => items, reload, appData);
  useEffect(() => { if (appData?.products) setItems(appData.products); }, [appData]);
  return (
    <div><SaveBtn onSave={save} saving={saving} saved={saved} />
      <Card title="⛽ Data Produk">
        <ListEditor items={items} onChange={setItems} schema={[{key:'name',label:'Nama Produk'},{key:'code',label:'Kode'},{key:'unit',label:'Satuan'}]} />
      </Card>
    </div>
  );
}

function Facilities() {
  const { appData, reload } = useApp();
  const TYPES = ['SPOB','Kapal Tanker','Truk Tangki','Storage Tank','Lainnya'];
  const BLANK = { facilityId:'', name:'', type:'SPOB', capacity:'', notes:'' };
  const [items,   setItems]   = useState(appData?.facilities || []);
  const [editing, setEditing] = useState(null); // id of row being edited
  const [editRow, setEditRow] = useState(null); // copy of row data
  const [row, setRow] = useState(BLANK);
  const { save, saving, saved } = useSave('facilities', () => items, reload, appData);
  useEffect(() => { if (appData?.facilities) setItems(appData.facilities); }, [appData]);

  const genId = () => `GPP-${String(items.length+1).padStart(3,'0')}`;
  const add = () => {
    if (!row.name) return;
    setItems(p => [...p, { ...row, id: Date.now().toString() }]);
    setRow({ ...BLANK, facilityId: genId() });
  };
  const del = (id) => { if (!confirm('Hapus fasilitas ini?')) return; setItems(p => p.filter(x => x.id !== id)); };
  const startEdit = (item) => { setEditing(item.id); setEditRow({ ...item }); };
  const cancelEdit = () => { setEditing(null); setEditRow(null); };
  const saveEdit = () => {
    setItems(p => p.map(x => x.id === editing ? { ...editRow } : x));
    setEditing(null); setEditRow(null);
  };

  const IF = 'w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300';

  return (
    <div><SaveBtn onSave={save} saving={saving} saved={saved} />
      <Card title="🚢 Facilities">
        <p className="text-xs text-gray-400 mb-3">Fleet and storage assets. Click ✎ to edit an entry.</p>

        {/* Add new row */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 p-3 bg-gray-50 rounded-xl border border-gray-200">
          <p className="col-span-full text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Add New Facility</p>
          {[['facilityId','Facility ID','text'],['name','Name *','text'],['capacity','Capacity (L)','number']].map(([k,l,t])=>(
            <div key={k}><label className="block text-xs text-gray-500 mb-1">{l}</label>
              <input type={t} value={row[k]||''} onChange={e=>setRow(p=>({...p,[k]:e.target.value}))}
                placeholder={k==='facilityId'?genId():''} className={IF}/></div>
          ))}
          <div><label className="block text-xs text-gray-500 mb-1">Type</label>
            <select value={row.type} onChange={e=>setRow(p=>({...p,type:e.target.value}))} className={IF}>
              {TYPES.map(t=><option key={t}>{t}</option>)}</select></div>
          <div><label className="block text-xs text-gray-500 mb-1">Notes</label>
            <input type="text" value={row.notes||''} onChange={e=>setRow(p=>({...p,notes:e.target.value}))} className={IF}/></div>
          <div className="flex items-end">
            <button onClick={add} disabled={!row.name}
              className="w-full bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
              + Add
            </button>
          </div>
        </div>

        {/* Table */}
        {items.length === 0
          ? <p className="text-gray-400 text-xs italic text-center py-6">No facilities yet.</p>
          : (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>{['ID','Name','Type','Capacity','Notes','Actions'].map(h=>(
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.map(item => {
                  const isEditingThis = editing === item.id;
                  return (
                    <tr key={item.id} className={isEditingThis ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                      {isEditingThis ? (
                        <>
                          <td className="px-2 py-2"><input value={editRow.facilityId||''} onChange={e=>setEditRow(p=>({...p,facilityId:e.target.value}))} className={IF+' w-24'}/></td>
                          <td className="px-2 py-2"><input value={editRow.name||''} onChange={e=>setEditRow(p=>({...p,name:e.target.value}))} className={IF}/></td>
                          <td className="px-2 py-2">
                            <select value={editRow.type||'SPOB'} onChange={e=>setEditRow(p=>({...p,type:e.target.value}))} className={IF+' w-32'}>
                              {TYPES.map(t=><option key={t}>{t}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-2"><input type="number" value={editRow.capacity||''} onChange={e=>setEditRow(p=>({...p,capacity:e.target.value}))} className={IF+' w-28'}/></td>
                          <td className="px-2 py-2"><input value={editRow.notes||''} onChange={e=>setEditRow(p=>({...p,notes:e.target.value}))} className={IF}/></td>
                          <td className="px-2 py-2">
                            <div className="flex gap-1">
                              <button onClick={saveEdit} className="text-xs bg-blue-700 text-white px-2.5 py-1 rounded-lg hover:bg-blue-800 font-semibold">✓ Save</button>
                              <button onClick={cancelEdit} className="text-xs border border-gray-200 px-2.5 py-1 rounded-lg hover:bg-gray-50">✕</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2.5 font-mono text-xs text-blue-600">{item.facilityId||'–'}</td>
                          <td className="px-3 py-2.5 font-semibold text-gray-800">{item.name}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{item.type}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-500">{item.capacity ? Number(item.capacity).toLocaleString('id-ID')+' L' : '–'}</td>
                          <td className="px-3 py-2.5 text-xs text-gray-400">{item.notes||'–'}</td>
                          <td className="px-3 py-2.5">
                            <div className="flex gap-1.5">
                              <button onClick={() => startEdit(item)} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded hover:bg-blue-50 hover:text-blue-700">✎ Edit</button>
                              <button onClick={() => del(item.id)} className="text-xs text-red-400 hover:text-red-600">✕</button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Settings() {
  const { appData, reload, userRole, user } = useApp();
  const [endpoint, setEndpoint] = useState(appData?.settings?.mopsEndpoint || '');
  const [savingEP, setSavingEP] = useState(false);
  const [savedEP, setSavedEP]   = useState(false);
  const [emailEndpoint, setEmailEndpoint] = useState(appData?.settings?.emailEndpoint || '');
  const [savingEmailEP, setSavingEmailEP] = useState(false);
  const [savedEmailEP, setSavedEmailEP]   = useState(false);
  const [resendKey,    setResendKey]    = useState(appData?.settings?.resendApiKey || '');
  const [resendFrom,   setResendFrom]   = useState(appData?.settings?.emailFrom || '');
  const [savingResend, setSavingResend] = useState(false);
  const [savedResend,  setSavedResend]  = useState(false);
  const [poThreshold, setPoThreshold] = useState(
    appData?.settings?.poApprovalThreshold != null
      ? String(appData.settings.poApprovalThreshold)
      : '5000000000'
  );
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [savedThreshold, setSavedThreshold]   = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  // Notification state
  const [notifTitle,  setNotifTitle]  = useState('');
  const [notifBody,   setNotifBody]   = useState('');
  const [notifTarget, setNotifTarget] = useState('all');
  const [notifSending, setNotifSending] = useState(false);
  const [notifResult,  setNotifResult]  = useState('');
  const isDirector = userRole === 'director' || userRole === 'superadmin';

  // Diagnostic state
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagResult,  setDiagResult]  = useState(null);
  const [cfTesting,   setCFTesting]   = useState(false);
  const [cfResult,    setCFResult]    = useState(null);

  const runDiagnostics = async () => {
    setDiagLoading(true); setDiagResult(null); setCFResult(null);
    try {
      const r = await getFCMDiagnostics(user?.email, userRole);
      setDiagResult(r);
    } catch(e) { setDiagResult({ error: e.message }); }
    finally { setDiagLoading(false); }
  };

  const runCFTest = async () => {
    setCFTesting(true); setCFResult(null);
    try {
      const r = await testCloudFunction();
      setCFResult(r);
    } catch(e) { setCFResult({ ok: false, error: e.message }); }
    finally { setCFTesting(false); }
  };

  const sendTestNotif = async () => {
    setNotifSending(true); setNotifResult('');
    try {
      await requestPushNotification({
        title: '🔔 GPP Portal — Test Notification',
        body: 'Push notification is working correctly. You will receive approval alerts here.',
        url: '/',
        targetRoles: ['staff','manager','director','superadmin'],
      });
      setNotifResult('✅ Request created in Firestore. Notification will arrive in a few seconds.');
    } catch(e) {
      setNotifResult(`❌ Failed to create request: ${e.message} — Have you deployed the Firestore rules? Run: firebase deploy --only firestore:rules`);
    } finally { setNotifSending(false); }
  };

  const sendCustomNotif = async () => {
    if (!notifTitle.trim() || !notifBody.trim()) { setNotifResult('⚠ Please fill in both title and message.'); return; }
    setNotifSending(true); setNotifResult('');
    try {
      const targetRoles = notifTarget === 'all'
        ? ['staff','manager','director','superadmin']
        : notifTarget === 'managers'
        ? ['manager','director','superadmin']
        : ['director','superadmin'];
      await requestPushNotification({ title: notifTitle.trim(), body: notifBody.trim(), url: '/', targetRoles });
      setNotifResult(`✅ Broadcast request created. Notification will arrive in a few seconds.`);
      setNotifTitle(''); setNotifBody('');
    } catch(e) {
      setNotifResult(`❌ Failed: ${e.message} — Have you deployed the Firestore rules? Run: firebase deploy --only firestore:rules`);
    } finally { setNotifSending(false); }
  };
  const [msg, setMsg] = useState('');
  const [userRoles, setUserRoles] = useState(appData?.userRoles || {});
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole]   = useState('staff');
  const [savingUsers, setSavingUsers] = useState(false);
  const [savedUsers, setSavedUsers]   = useState(false);
  const defaultChain = { po:['manager','director'], so:['manager','director'], ol:['manager','director'] };
  const [chains, setChains] = useState({ ...defaultChain, ...(appData?.settings?.approvalChain||{}) });
  const [savingChain, setSavingChain] = useState(false);
  const [savedChain, setSavedChain]   = useState(false);

  const ROLES = ['superadmin','director','manager','staff'];
  const ROLE_LABELS = { superadmin:'Super Admin', director:'Direktur', manager:'Manager', staff:'Staff' };
  const DOC_TYPES = [['po','Purchase Order'],['so','Sales Order'],['ol','Surat Penawaran']];
  const CHAIN_ROLES = ['manager','director'];

  const addUser = () => { if(!newEmail)return; setUserRoles(p=>({...p,[newEmail.toLowerCase()]:newRole})); setNewEmail(''); setNewRole('staff'); };
  const removeUser = email => setUserRoles(p=>{const c={...p};delete c[email];return c;});
  // Role visibility state
  // Only staff and manager are configurable — director/superadmin always have full access
  const buildInitialPerms = () => {
    const saved = appData?.settings?.rolePermissions || {};
    const result = {};
    ['staff','manager'].forEach(role => {
      const savedRoutes = saved[role];
      const defaults = DEFAULT_ROLE_MENU[role] || [];
      result[role] = Array.isArray(savedRoutes)
        ? savedRoutes
        : defaults.filter(r => r !== '/');
    });
    return result;
  };
  const [rolePerms,     setRolePerms]     = useState(buildInitialPerms);
  const [savingPerms,   setSavingPerms]   = useState(false);
  const [savedPerms,    setSavedPerms]    = useState(false);

  const togglePerm = (role, route) => {
    setRolePerms(p => {
      const current = p[role] || [];
      const next = current.includes(route)
        ? current.filter(r => r !== route)
        : [...current, route];
      return { ...p, [role]: next };
    });
  };

  const savePerms = async () => {
    setSavingPerms(true);
    try {
      await patchField('settings', { ...(appData?.settings || {}), rolePermissions: rolePerms });
      await reload();
      setSavedPerms(true);
      setTimeout(() => setSavedPerms(false), 2500);
    } finally { setSavingPerms(false); }
  };

  const resetPerms = () => {
    setRolePerms({
      staff:   DEFAULT_ROLE_MENU.staff.filter(r => r !== '/'),
      manager: DEFAULT_ROLE_MENU.manager.filter(r => r !== '/'),
    });
  };
  const toggleChainRole = (dt,role) => setChains(p=>{const cur=p[dt]||[];const has=cur.includes(role);let next=has?cur.filter(r=>r!==role):[...cur,role];next=CHAIN_ROLES.filter(r=>next.includes(r));if(next.length===0)next=['director'];return{...p,[dt]:next};});
  const saveChain = async () => { setSavingChain(true); try{await patchField('settings',{...(appData?.settings||{}),approvalChain:chains});await reload();setSavedChain(true);setTimeout(()=>setSavedChain(false),2500);}finally{setSavingChain(false);} };
  const saveEndpoint = async () => { setSavingEP(true); try{await patchField('settings',{...(appData?.settings||{}),mopsEndpoint:endpoint});await reload();setSavedEP(true);setTimeout(()=>setSavedEP(false),2500);}finally{setSavingEP(false);} };
  const saveEmailEndpoint = async () => { setSavingEmailEP(true); try{await patchField('settings',{...(appData?.settings||{}),emailEndpoint:emailEndpoint.trim()});await reload();setSavedEmailEP(true);setTimeout(()=>setSavedEmailEP(false),2500);}finally{setSavingEmailEP(false);} };
  const saveResend = async () => { setSavingResend(true); try{await patchField('settings',{...(appData?.settings||{}),resendApiKey:resendKey.trim(),emailFrom:resendFrom.trim()});await reload();setSavedResend(true);setTimeout(()=>setSavedResend(false),2500);}finally{setSavingResend(false);} };
  const saveThreshold = async () => { setSavingThreshold(true); try{await patchField('settings',{...(appData?.settings||{}),poApprovalThreshold:parseFloat(poThreshold)||5000000000});await reload();setSavedThreshold(true);setTimeout(()=>setSavedThreshold(false),2500);}finally{setSavingThreshold(false);} };
  const doExport = async () => { setExporting(true); try{const data=await exportBackup();const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`gpp-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);setMsg('✅ Backup berhasil diunduh.');}catch(e){setMsg('❌ Export gagal: '+e.message);}finally{setExporting(false);setTimeout(()=>setMsg(''),4000);} };
  const doImport = async (e) => { const file=e.target.files[0];if(!file)return;if(!confirm('Restore backup ini?'))return;setImporting(true);try{const json=JSON.parse(await file.text());await importBackup(json);await reload();setMsg('✅ Restore berhasil.');}catch(err){setMsg('❌ Import gagal: '+err.message);}finally{setImporting(false);e.target.value='';setTimeout(()=>setMsg(''),4000);} };

  return (
    <div>
      {/* Role Visibility — Director/Superadmin only */}
      {isDirector && (
        <Card title="👁 Role Visibility">
          <p className="text-xs text-gray-400 mb-1">
            Control which sidebar menus are visible to each role.
            Dashboard is always visible. Director and Super Admin always have full access and cannot be restricted.
          </p>
          <div className="flex items-center justify-between mb-4">
            <button onClick={resetPerms} className="text-xs text-gray-400 hover:text-gray-700 underline">
              Reset to defaults
            </button>
            <button onClick={savePerms} disabled={savingPerms}
              className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
              {savingPerms ? '⏳' : savedPerms ? '✅ Saved' : '💾 Save Permissions'}
            </button>
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 w-48">Menu</th>
                  {/* Superadmin — always locked */}
                  <th className="text-center px-4 py-3 text-xs font-semibold text-purple-600 w-28">
                    Super Admin
                    <p className="font-normal text-[10px] text-gray-400 mt-0.5">always full</p>
                  </th>
                  {/* Director — always locked */}
                  <th className="text-center px-4 py-3 text-xs font-semibold text-blue-700 w-28">
                    Director
                    <p className="font-normal text-[10px] text-gray-400 mt-0.5">always full</p>
                  </th>
                  {/* Manager — configurable */}
                  <th className="text-center px-4 py-3 text-xs font-semibold text-green-700 w-28">
                    Manager
                    <p className="font-normal text-[10px] text-green-600 mt-0.5">configurable</p>
                  </th>
                  {/* Staff — configurable */}
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 w-28">
                    Staff
                    <p className="font-normal text-[10px] text-green-600 mt-0.5">configurable</p>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {/* Dashboard — always visible for all */}
                <tr className="bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-400 italic">Dashboard (always visible)</td>
                  {['superadmin','director','manager','staff'].map(role => (
                    <td key={role} className="text-center px-4 py-3">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-green-100 text-green-600 text-xs">✓</span>
                    </td>
                  ))}
                </tr>

                {ALL_CONFIGURABLE_ROUTES.map(({ to, label, icon }) => {
                  const isMasterData = to === '/master-data';
                  return (
                    <tr key={to} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="mr-2">{icon}</span>
                        <span className="text-gray-800 text-sm">{label}</span>
                      </td>

                      {/* Superadmin — always on, locked */}
                      <td className="text-center px-4 py-3">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-green-100 text-green-600 text-xs">✓</span>
                      </td>

                      {/* Director — always on, locked */}
                      <td className="text-center px-4 py-3">
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-green-100 text-green-600 text-xs">✓</span>
                      </td>

                      {/* Manager — configurable (Master Data special: always off for manager) */}
                      <td className="text-center px-4 py-3">
                        {isMasterData ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-gray-100 text-gray-400 text-xs" title="Master Data is always restricted to Director+">–</span>
                        ) : (
                          <button
                            onClick={() => togglePerm('manager', to)}
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-md border-2 transition-colors cursor-pointer ${
                              (rolePerms.manager || []).includes(to)
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white border-gray-300 text-transparent hover:border-blue-400'
                            }`}>
                            ✓
                          </button>
                        )}
                      </td>

                      {/* Staff — configurable */}
                      <td className="text-center px-4 py-3">
                        {isMasterData ? (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-gray-100 text-gray-400 text-xs" title="Master Data is always restricted to Director+">–</span>
                        ) : (
                          <button
                            onClick={() => togglePerm('staff', to)}
                            className={`inline-flex items-center justify-center w-6 h-6 rounded-md border-2 transition-colors cursor-pointer ${
                              (rolePerms.staff || []).includes(to)
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white border-gray-300 text-transparent hover:border-blue-400'
                            }`}>
                            ✓
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3 text-xs text-amber-700">
            Changes take effect immediately after saving — users will see the updated menus on their next page load or app refresh.
          </div>
        </Card>
      )}

      <Card title="👥 Users & Roles">
        <p className="text-xs text-gray-400 mb-4">Atur role setiap pengguna. Email harus terdaftar di Firebase Authentication.</p>
        <div className="flex gap-2 mb-4 flex-wrap">
          <input type="email" value={newEmail} onChange={e=>setNewEmail(e.target.value)} placeholder="email@perusahaan.com"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/>
          <select value={newRole} onChange={e=>setNewRole(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none bg-white">
            {ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <button onClick={addUser} className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-800">+ Tambah</button>
        </div>
        {Object.keys(userRoles).length===0
          ? <p className="text-gray-400 text-xs italic mb-4">Belum ada user — semua login default ke Staff.</p>
          : <div className="space-y-2 mb-4">{Object.entries(userRoles).map(([email,role])=>(
              <div key={email} className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2.5 bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full text-white ${role==='superadmin'||role==='director'?'bg-blue-700':role==='manager'?'bg-teal-600':'bg-gray-500'}`}>{ROLE_LABELS[role]||role}</span>
                  <span className="text-sm text-gray-700 font-mono">{email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <select value={role} onChange={e=>setUserRoles(p=>({...p,[email]:e.target.value}))} className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none bg-white">
                    {ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <button onClick={()=>removeUser(email)} className="text-red-400 hover:text-red-600 text-xs">✕</button>
                </div>
              </div>
            ))}</div>
        }
        <div className="flex justify-end"><button onClick={saveUsers} disabled={savingUsers} className="bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-60">{savingUsers?'⏳':savedUsers?'✅ Tersimpan':'💾 Simpan Users'}</button></div>
      </Card>

      <Card title="⛓️ Konfigurasi Approval Chain">
        <p className="text-xs text-gray-400 mb-4">Atur siapa yang perlu menyetujui setiap dokumen. Minimal satu approver.</p>
        <div className="space-y-3 mb-4">
          {DOC_TYPES.map(([dt,label])=>(
            <div key={dt} className="flex items-center justify-between border border-gray-100 rounded-lg px-4 py-3 flex-wrap gap-3">
              <p className="text-sm font-medium text-gray-700 w-36">{label}</p>
              <div className="flex gap-4">{CHAIN_ROLES.map(role=>(
                <label key={role} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={(chains[dt]||[]).includes(role)} onChange={()=>toggleChainRole(dt,role)} className="rounded w-4 h-4"/>
                  <span className="text-gray-600">{role==='director'?'Direktur':'Manager'}</span>
                </label>
              ))}</div>
              <div className="flex gap-1">{(chains[dt]||[]).map(r=><span key={r} className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold capitalize">{r}</span>)}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-end"><button onClick={saveChain} disabled={savingChain} className="bg-blue-700 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-60">{savingChain?'⏳':savedChain?'✅ Tersimpan':'💾 Simpan Chain'}</button></div>
      </Card>

      <Card title="📡 MOPS Endpoint">
        <p className="text-xs text-gray-400 mb-3">Google Apps Script URL for fetching live MOPS and pricing data.</p>
        <div className="flex gap-2">
          <input type="text" value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="https://script.google.com/macros/s/..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono text-xs"/>
          <button onClick={saveEndpoint} disabled={savingEP} className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-60 shrink-0">{savingEP?'⏳':savedEP?'✅':'💾'}</button>
        </div>
        {endpoint && <p className="text-xs text-green-600 mt-2">✅ MOPS endpoint configured</p>}
      </Card>

      <Card title="📧 Email Notifications — Resend API">
        <p className="text-xs text-gray-400 mb-3">
          <b>Recommended.</b> Resend sends emails directly from the app — no Google account or GAS script needed.
          Free tier: 100 emails/day. Sign up at <b>resend.com</b>, get an API key, paste it below.
        </p>
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 mb-4 text-xs text-blue-700 space-y-1">
          <p><b>Setup (5 minutes):</b></p>
          <p>1. Go to <b>resend.com</b> → Sign Up (free) → API Keys → Create API Key</p>
          <p>2. Paste the key below and save</p>
          <p>3. Optional: add your domain in Resend → Domains → verify DNS records → then set "From" email to <code>noreply@globalpetro.co.id</code></p>
          <p>4. Without domain verification, emails send from <code>onboarding@resend.dev</code> — fully functional for internal use</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Resend API Key</label>
            <div className="flex gap-2">
              <input type="password" value={resendKey} onChange={e=>setResendKey(e.target.value)}
                placeholder="re_xxxxxxxxxxxxxxxxxxxxxxxx"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono text-xs"/>
              <button onClick={saveResend} disabled={savingResend}
                className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-60 shrink-0">
                {savingResend ? '⏳' : savedResend ? '✅' : '💾'}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">From Address (optional)</label>
            <input type="text" value={resendFrom} onChange={e=>setResendFrom(e.target.value)}
              placeholder="GPP Portal <noreply@globalpetro.co.id>"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono text-xs"/>
            <p className="text-[10px] text-gray-400 mt-0.5">Leave blank to use Resend's default sender. Only fill this after verifying your domain in Resend.</p>
          </div>
        </div>
        {resendKey && <p className="text-xs text-green-600 mt-3">✅ Resend API key configured</p>}
        {!resendKey && <p className="text-xs text-amber-600 mt-3">⚠ Not configured — approval emails will not be sent</p>}
      </Card>

      <Card title="📧 Email Notifications — GAS (alternative)">
        <p className="text-xs text-gray-400 mb-3">
          Use this only if you prefer Google Apps Script. If Resend API key is set above, it takes priority over this.
        </p>
        <div className="flex gap-2">
          <input type="text" value={emailEndpoint} onChange={e=>setEmailEndpoint(e.target.value)}
            placeholder="https://script.google.com/macros/s/..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono text-xs"/>
          <button onClick={saveEmailEndpoint} disabled={savingEmailEP}
            className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-60 shrink-0">
            {savingEmailEP ? '⏳' : savedEmailEP ? '✅' : '💾'}
          </button>
        </div>
        {emailEndpoint && <p className="text-xs text-green-600 mt-2">✅ GAS endpoint configured</p>}
      </Card>

      <Card title="💰 PO Approval Threshold">
        <p className="text-xs text-gray-400 mb-3">
          POs below this value require <b>Manager</b> approval only.
          POs at or above this value require <b>Manager + Director</b> approval.
        </p>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 mb-1">Below Threshold</p>
            <p className="text-sm font-bold text-blue-800">Manager only</p>
          </div>
          <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-center">
            <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500 mb-1">At / Above Threshold</p>
            <p className="text-sm font-bold text-orange-800">Manager + Director</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <span className="text-sm text-gray-500 shrink-0">Rp</span>
          <input type="number" value={poThreshold} onChange={e=>setPoThreshold(e.target.value)}
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono"
            min="0" step="500000000"/>
          <button onClick={saveThreshold} disabled={savingThreshold}
            className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-60 shrink-0">
            {savingThreshold ? '⏳' : savedThreshold ? '✅' : '💾'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Current threshold: <span className="font-mono font-semibold text-gray-600">
            Rp {Number(poThreshold||5000000000).toLocaleString('id-ID')}
          </span>
        </p>
      </Card>

      {/* Push Notifications — Director / Super Admin only */}
      {isDirector && (
        <>
          <Card title="🔬 FCM Push Diagnostics">
            <p className="text-xs text-gray-400 mb-4">
              Run this check to see exactly where the push notification chain is failing.
              Each step must pass before notifications can be delivered.
            </p>

            <button onClick={runDiagnostics} disabled={diagLoading}
              className="bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50 mb-4">
              {diagLoading ? '⏳ Running diagnostics…' : '🔬 Run Diagnostics'}
            </button>

            {diagResult && !diagResult.error && (
              <div className="space-y-2 mb-4">
                {[
                  diagResult.vapidKey,
                  diagResult.serviceWorker,
                  diagResult.permission,
                  diagResult.token,
                  diagResult.firestoreToken,
                ].map((step, i) => (
                  <div key={i} className={`flex items-start gap-3 rounded-lg px-4 py-3 border ${
                    step.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  }`}>
                    <span className="text-lg shrink-0">{step.ok ? '✅' : '❌'}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{step.label}</p>
                      <p className={`text-xs mt-0.5 ${step.ok ? 'text-green-700' : 'text-red-600'}`}>{step.detail}</p>
                    </div>
                  </div>
                ))}
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 text-sm text-blue-800">
                  <b>Registered devices:</b> {diagResult.registeredDevices} device(s) have FCM tokens in Firestore
                </div>
              </div>
            )}

            {diagResult?.error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 mb-4">
                Diagnostics failed: {diagResult.error}
              </div>
            )}

            {/* Cloud Function test */}
            <div className="border-t pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Cloud Function Test</p>
              <p className="text-xs text-gray-400 mb-3">
                Creates a test document in Firestore and waits up to 12 seconds to see if the Cloud Function picks it up and deletes it.
                If it doesn't, the function is not deployed.
              </p>
              <button onClick={runCFTest} disabled={cfTesting}
                className="border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50">
                {cfTesting ? '⏳ Waiting for Cloud Function… (up to 12s)' : '⚡ Test Cloud Function'}
              </button>
              {cfResult && (
                <div className={`mt-3 rounded-lg px-4 py-3 text-sm border ${cfResult.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  {cfResult.ok
                    ? `✅ Cloud Function responded in ${cfResult.seconds}s — it IS deployed and working.`
                    : cfResult.error
                    ? `❌ Error: ${cfResult.error}`
                    : `❌ Cloud Function did NOT respond within 12 seconds. Deploy it with:\n\ncd functions && npm install && cd ..\nfirebase deploy --only functions`}
                </div>
              )}
            </div>

            {/* VAPID key instructions */}
            <div className="border-t pt-4 mt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Vercel VAPID Key — Important</p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800 space-y-1">
                <p>• If Vercel shows the key as <b>"Sensitive"</b> (masked value), the key IS stored — Vercel just hides long secrets in the UI.</p>
                <p>• However, Vite bakes env vars into the bundle <b>at build time</b>. If you added the key AFTER the last deploy, the running app doesn't have it yet.</p>
                <p>• <b>Fix:</b> After adding or changing <code>VITE_FIREBASE_VAPID_KEY</code> in Vercel, you must trigger a new deployment (e.g. push a commit, or use Vercel Dashboard → Deployments → Redeploy).</p>
                <p>• Run diagnostics above — if VAPID Key shows ❌, the env var is empty in the current build.</p>
              </div>
            </div>
          </Card>

          <Card title="🔔 Test Push Notification">
            <p className="text-xs text-gray-400 mb-4">
              Send a real test push to all registered devices. Use the diagnostics above first
              to confirm FCM is working end-to-end.
            </p>
            <button onClick={sendTestNotif} disabled={notifSending}
              className="bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
              {notifSending ? '⏳ Sending…' : '🔔 Send Test Notification'}
            </button>
            {notifResult && (
              <p className={`mt-3 text-sm ${notifResult.startsWith('✅') ? 'text-green-700' : notifResult.startsWith('⚠') ? 'text-amber-700' : 'text-red-600'}`}>
                {notifResult}
              </p>
            )}
          </Card>

          <Card title="📢 Custom Broadcast">
            <p className="text-xs text-gray-400 mb-4">
              Send a custom message to all app users or a specific group. Useful for announcements, reminders, or urgent alerts.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Notification Title</label>
                <input type="text" value={notifTitle} onChange={e => setNotifTitle(e.target.value)}
                  placeholder="e.g. System Update, Important Notice…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  maxLength={64}/>
                <p className="text-[10px] text-gray-400 mt-0.5">{notifTitle.length}/64</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Message</label>
                <textarea value={notifBody} onChange={e => setNotifBody(e.target.value)}
                  placeholder="Type your message here…"
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                  maxLength={200}/>
                <p className="text-[10px] text-gray-400 mt-0.5">{notifBody.length}/200</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-widest mb-1">Send To</label>
                <div className="flex gap-2">
                  {[['all','All Users'],['managers','Managers & Directors'],['directors','Directors Only']].map(([val, label]) => (
                    <button key={val} onClick={() => setNotifTarget(val)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        notifTarget === val
                          ? 'bg-blue-700 text-white border-blue-700'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                      }`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={sendCustomNotif} disabled={notifSending || !notifTitle.trim() || !notifBody.trim()}
                className="w-full bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
                {notifSending ? '⏳ Sending…' : '📢 Send Broadcast'}
              </button>
              {notifResult && (
                <p className={`text-sm ${notifResult.startsWith('✅') ? 'text-green-700' : notifResult.startsWith('⚠') ? 'text-amber-700' : 'text-red-600'}`}>
                  {notifResult}
                </p>
              )}
            </div>
          </Card>
        </>
      )}

      <Card title="💾 Backup & Restore">
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800"><b>⚠️ Selalu backup sebelum perubahan besar.</b></div>
          <div className="flex gap-3 flex-wrap">
            <button onClick={doExport} disabled={exporting} className="bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-60">{exporting?'⏳':'⬇️ Export JSON'}</button>
            <label className={`flex items-center gap-2 bg-white border border-gray-300 px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer ${importing?'opacity-60 pointer-events-none':''}`}>
              {importing?'⏳':'⬆️ Import JSON'}<input type="file" accept=".json" onChange={doImport} className="hidden"/>
            </label>
          </div>
          {msg&&<div className={`rounded-lg px-4 py-3 text-sm ${msg.startsWith('✅')?'bg-green-50 text-green-700':'bg-red-50 text-red-700'}`}>{msg}</div>}
        </div>
      </Card>
    </div>
  );
}

const TABS = [
  {to:'/master-data/corporate',  label:'Corporate',  icon:'🏢'},
  {to:'/master-data/clients',    label:'Client',     icon:'👥'},
  {to:'/master-data/suppliers',  label:'Supplier',   icon:'🏭'},
  {to:'/master-data/products',   label:'Product',    icon:'⛽'},
  {to:'/master-data/facilities', label:'Facilities', icon:'🚢'},
  {to:'/master-data/settings',   label:'Settings',   icon:'🔧'},
];

export default function MasterData() {
  return (
    <div className="flex flex-col h-full pt-14 md:pt-0">
      <div className="no-print bg-white border-b border-gray-200 px-2 flex gap-0.5 overflow-x-auto shrink-0">
        {TABS.map(({to,label,icon})=>(
          <NavLink key={to} to={to} className={({isActive})=>`flex items-center gap-1.5 px-3 md:px-4 py-3 text-xs md:text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${isActive?'border-blue-700 text-blue-700':'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <span>{icon}</span><span className="hidden sm:inline">{label}</span>
          </NavLink>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4 md:p-6 max-w-3xl w-full mx-auto">
        <Routes>
          <Route index element={<Navigate to="corporate" replace/>}/>
          <Route path="corporate"  element={<Corporate/>}/>
          <Route path="clients"    element={<Clients/>}/>
          <Route path="suppliers"  element={<Suppliers/>}/>
          <Route path="products"   element={<Products/>}/>
          <Route path="facilities" element={<Facilities/>}/>
          <Route path="settings"   element={<Settings/>}/>
        </Routes>
      </div>
    </div>
  );
}
