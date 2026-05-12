import { useState } from 'react';
import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useApp } from '../../App.jsx';
import { patchField, patchData, exportBackup, importBackup } from '../../firebase.js';

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
  const [sign,     setSign]       = useState(appData?.signatories || {});
  const [banks,    setBanks]      = useState(appData?.banks || (appData?.banking ? [{ ...appData.banking, id: '1', isPrimary: true }] : []));
  const [rates,    setRates]      = useState(appData?.rates || { ppn: 11, pph: 0.3, bphMigas: 0.25, bankRate: 6.5 });
  const [provinces,setProvinces]  = useState(appData?.pbbkbProvinces || []);
  const [newProv,  setNP]         = useState({ name: '', rate: '' });

  const sho = k => v => setHO(p => ({ ...p, [k]: v }));
  const ss  = k => v => setSign(p => ({ ...p, [k]: v }));
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
        headOffice, branches, signatories: sign, banks, rates, pbbkbProvinces: provinces,
        company:  { name: headOffice.name, address1: headOffice.address, npwp: headOffice.npwp, phone: headOffice.phone, email: headOffice.email },
        banking:  banks.find(b => b.isPrimary) || banks[0] || {},
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
            <F label="Nama Perusahaan" value={headOffice.name    || ''} onChange={sho('name')} />
            <F label="NPWP"           value={headOffice.npwp    || ''} onChange={sho('npwp')} />
            <F label="Alamat"         value={headOffice.address || ''} onChange={sho('address')} />
            <F label="Telepon"        value={headOffice.phone   || ''} onChange={sho('phone')} />
            <F label="Email"          value={headOffice.email   || ''} onChange={sho('email')} />
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
                      {[['name','Nama Cabang'],['address','Alamat'],['npwp','NPWP Cabang'],['phone','Telepon'],['email','Email']].map(([k, l]) => (
                        <div key={k}>
                          <label className="block text-xs text-gray-500 mb-1">{l}</label>
                          <input type="text" value={b[k] || ''} onChange={e => updBranch(i, k, e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 bg-white" />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
          }
        </Card>

        <Card title="✍️ Penandatangan">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <F label="Prepared By"      value={sign.preparedBy   || ''} onChange={ss('preparedBy')} />
            <F label="Approved By"      value={sign.approvedBy   || ''} onChange={ss('approvedBy')} />
            <F label="Petugas Lapangan" value={sign.fieldOfficer || ''} onChange={ss('fieldOfficer')} />
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

function useSave(field, getData, reload) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = async () => {
    setSaving(true);
    try { await patchField(field, getData()); await reload(); setSaved(true); setTimeout(() => setSaved(false), 2500); }
    finally { setSaving(false); }
  };
  return { save, saving, saved };
}

function Clients() {
  const { appData, reload } = useApp();
  const [items, setItems] = useState(appData?.clients || []);
  const { save, saving, saved } = useSave('clients', () => items, reload);
  return (
    <div><SaveBtn onSave={save} saving={saving} saved={saved} />
      <Card title="👥 Client Database">
        <p className="text-xs text-gray-400 mb-4">Tersedia sebagai pilihan di Surat Penawaran.</p>
        <ListEditor items={items} onChange={setItems} schema={[{key:'name',label:'Nama'},{key:'address',label:'Alamat'},{key:'contact',label:'Kontak'},{key:'npwp',label:'NPWP'},{key:'top',label:'TOP (hari)'}]} />
      </Card>
    </div>
  );
}

function Suppliers() {
  const { appData, reload } = useApp();
  const [items, setItems] = useState(appData?.suppliers || []);
  const { save, saving, saved } = useSave('suppliers', () => items, reload);
  return (
    <div><SaveBtn onSave={save} saving={saving} saved={saved} />
      <Card title="🏭 Supplier Database">
        <p className="text-xs text-gray-400 mb-4">Tersedia sebagai pilihan di Purchase Order.</p>
        <ListEditor items={items} onChange={setItems} schema={[{key:'name',label:'Nama'},{key:'address',label:'Alamat'},{key:'contact',label:'Kontak'},{key:'npwp',label:'NPWP'}]} />
      </Card>
    </div>
  );
}

function Products() {
  const { appData, reload } = useApp();
  const [items, setItems] = useState(appData?.products || []);
  const { save, saving, saved } = useSave('products', () => items, reload);
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
  const [items, setItems] = useState(appData?.facilities || []);
  const { save, saving, saved } = useSave('facilities', () => items, reload);
  const genId = () => `GPP-${String(items.length+1).padStart(3,'0')}`;
  const [row, setRow] = useState({ facilityId: genId(), name:'', type:'SPOB', capacity:'', notes:'' });
  const add = () => { if(!row.name)return; setItems(p=>[...p,{...row,id:Date.now().toString()}]); setRow(r=>({...r,facilityId:genId(),name:'',capacity:'',notes:''})); };
  const del = i => setItems(p=>p.filter((_,idx)=>idx!==i));
  const upd = (i,k,v) => setItems(p=>p.map((x,idx)=>idx===i?{...x,[k]:v}:x));
  return (
    <div><SaveBtn onSave={save} saving={saving} saved={saved} />
      <Card title="🚢 Facilities">
        <p className="text-xs text-gray-400 mb-3">ID bisa diedit sesuai nomor registrasi internal GPP.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
          {[['facilityId','Facility ID','text'],['name','Nama','text'],['capacity','Kapasitas (L)','number']].map(([k,l,t])=>(
            <div key={k}><label className="block text-xs text-gray-500 mb-1">{l}</label>
              <input type={t} value={row[k]||''} onChange={e=>setRow(p=>({...p,[k]:e.target.value}))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
          ))}
          <div><label className="block text-xs text-gray-500 mb-1">Tipe</label>
            <select value={row.type} onChange={e=>setRow(p=>({...p,type:e.target.value}))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300">
              {TYPES.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
          <div><label className="block text-xs text-gray-500 mb-1">Catatan</label>
            <input type="text" value={row.notes||''} onChange={e=>setRow(p=>({...p,notes:e.target.value}))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"/></div>
          <div className="flex items-end"><button onClick={add} className="w-full bg-blue-700 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-800">+ Tambah</button></div>
        </div>
        {items.length===0?<p className="text-gray-400 text-xs italic">Belum ada fasilitas.</p>:(
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm"><thead className="bg-gray-50"><tr>
              {['ID','Nama','Tipe','Kapasitas','Catatan',''].map(h=><th key={h} className="text-left px-3 py-2 text-xs text-gray-500 font-medium">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item,i)=>(
                <tr key={item.id||i} className="hover:bg-gray-50">
                  <td className="px-3 py-2"><input type="text" value={item.facilityId||''} onChange={e=>upd(i,'facilityId',e.target.value)} className="font-mono text-xs border-b border-gray-300 focus:outline-none focus:border-blue-400 bg-transparent w-24"/></td>
                  <td className="px-3 py-2 font-medium text-gray-800">{item.name}</td>
                  <td className="px-3 py-2 text-gray-600 text-xs">{item.type}</td>
                  <td className="px-3 py-2 text-gray-600 text-xs">{item.capacity?Number(item.capacity).toLocaleString('id-ID')+' L':'-'}</td>
                  <td className="px-3 py-2 text-gray-400 text-xs">{item.notes||'-'}</td>
                  <td className="px-3 py-2"><button onClick={()=>del(i)} className="text-red-400 hover:text-red-600 text-xs">✕</button></td>
                </tr>
              ))}
            </tbody></table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Settings() {
  const { appData, reload } = useApp();
  const [endpoint, setEndpoint] = useState(appData?.settings?.mopsEndpoint || '');
  const [savingEP, setSavingEP] = useState(false);
  const [savedEP, setSavedEP]   = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
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
  const saveUsers = async () => { setSavingUsers(true); try{await patchField('userRoles',userRoles);await reload();setSavedUsers(true);setTimeout(()=>setSavedUsers(false),2500);}finally{setSavingUsers(false);} };
  const toggleChainRole = (dt,role) => setChains(p=>{const cur=p[dt]||[];const has=cur.includes(role);let next=has?cur.filter(r=>r!==role):[...cur,role];next=CHAIN_ROLES.filter(r=>next.includes(r));if(next.length===0)next=['director'];return{...p,[dt]:next};});
  const saveChain = async () => { setSavingChain(true); try{await patchField('settings',{...(appData?.settings||{}),approvalChain:chains});await reload();setSavedChain(true);setTimeout(()=>setSavedChain(false),2500);}finally{setSavingChain(false);} };
  const saveEndpoint = async () => { setSavingEP(true); try{await patchField('settings',{...(appData?.settings||{}),mopsEndpoint:endpoint});await reload();setSavedEP(true);setTimeout(()=>setSavedEP(false),2500);}finally{setSavingEP(false);} };
  const doExport = async () => { setExporting(true); try{const data=await exportBackup();const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`gpp-backup-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(url);setMsg('✅ Backup berhasil diunduh.');}catch(e){setMsg('❌ Export gagal: '+e.message);}finally{setExporting(false);setTimeout(()=>setMsg(''),4000);} };
  const doImport = async (e) => { const file=e.target.files[0];if(!file)return;if(!confirm('Restore backup ini?'))return;setImporting(true);try{const json=JSON.parse(await file.text());await importBackup(json);await reload();setMsg('✅ Restore berhasil.');}catch(err){setMsg('❌ Import gagal: '+err.message);}finally{setImporting(false);e.target.value='';setTimeout(()=>setMsg(''),4000);} };

  return (
    <div>
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
        <div className="flex gap-2">
          <input type="text" value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="https://script.google.com/macros/s/..."
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono text-xs"/>
          <button onClick={saveEndpoint} disabled={savingEP} className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-60 shrink-0">{savingEP?'⏳':savedEP?'✅':'💾'}</button>
        </div>
        {endpoint&&<p className="text-xs text-green-600 mt-2">✅ Endpoint terkonfigurasi</p>}
      </Card>

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
