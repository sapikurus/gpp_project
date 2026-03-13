import { useState, useEffect } from 'react';
import { useApp } from '../../App.jsx';
import { fetchCollection, createNumberedDoc, POS_REF } from '../../firebase.js';
import { formatIDR, formatDateShort, buildPONumber, today, terbilang } from '../../utils/utils.js';
import PrintWrapper from '../Layout/PrintWrapper.jsx';
import logo from '../../assets/gpp-logo.png';

const INIT = {
  poDate:       today(),
  vendorName:   '',
  vendorAddr:   '',
  shipTo:       '',
  vessel:       '',
  terms:        'Net 14',
  shipVia:      'Bunker Service',
  expectedDate: '',
  vendorTaxable: true,
  taxRate:      1,
  items: [{ description: '', qty: '', unitPrice: '' }],
  discount:     0,
  notes:        '',
};

export default function PurchaseOrder() {
  const { appData } = useApp();
  const [form,    setForm]    = useState(INIT);
  const [orders,  setOrders]  = useState([]);
  const [printing, setPrinting] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [loadingList, setLL]    = useState(true);

  useEffect(() => {
    fetchCollection(POS_REF()).then(p => { setOrders(p); setLL(false); });
  }, []);

  const set = k => v => setForm(p => ({ ...p, [k]: v }));
  const setItem = (i, k, v) => {
    const items = [...form.items];
    items[i] = { ...items[i], [k]: v };
    setForm(p => ({ ...p, items }));
  };
  const addItem    = () => setForm(p => ({ ...p, items: [...p.items, { description: '', qty: '', unitPrice: '' }] }));
  const removeItem = (i) => setForm(p => ({ ...p, items: p.items.filter((_, idx) => idx !== i) }));

  const subtotal   = form.items.reduce((s, it) => s + ((parseFloat(it.qty)||0) * (parseFloat(it.unitPrice)||0)), 0);
  const discount   = parseFloat(form.discount) || 0;
  const afterDisc  = subtotal - discount;
  const ppnRate    = (appData?.rates?.ppn || 11) / 100;
  const taxAmt     = form.vendorTaxable ? afterDisc * ppnRate : 0;
  const totalOrder = afterDisc + taxAmt;

  const saveAndPrint = async () => {
    setSaving(true);
    try {
      const d = new Date(form.poDate);
      const { id } = await createNumberedDoc(
        'po',
        POS_REF(),
        { ...form, subtotal, discount, taxAmt, totalOrder },
        (seq) => buildPONumber(seq, d.getMonth() + 1, d.getFullYear())
      );
      const fresh = await fetchCollection(POS_REF());
      setOrders(fresh);
      setPrinting(fresh.find(o => o.id === id) || null);
    } finally {
      setSaving(false);
    }
  };

  // Pre-fill from master data
  const vendors   = appData?.vendors   || [];
  const vessels   = appData?.vessels   || [];
  const products  = appData?.products  || [];
  const co        = appData?.company   || {};
  const sign      = appData?.signatories || {};

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {printing && (
        <PrintWrapper onClose={() => setPrinting(null)}>
          <POPrint data={printing} company={co} signatories={sign} rates={appData?.rates} />
        </PrintWrapper>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Purchase Order</h1>
          <p className="text-gray-500 text-sm mt-1">Buat & cetak PO format GPP</p>
        </div>
        <button onClick={saveAndPrint} disabled={saving}
          className="bg-blue-700 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
          {saving ? '⏳' : '🖨️ Simpan & Cetak PO'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">

          {/* Header */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-4">Header PO</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tanggal PO</label>
                <input type="date" value={form.poDate} onChange={e => set('poDate')(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Tanggal Ekspektasi</label>
                <input type="date" value={form.expectedDate} onChange={e => set('expectedDate')(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Vendor</label>
                <input type="text" list="vendor-list" value={form.vendorName} onChange={e => {
                  set('vendorName')(e.target.value);
                  const v = vendors.find(x => x.name === e.target.value);
                  if (v) set('vendorAddr')(v.address || '');
                }} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                <datalist id="vendor-list">{vendors.map(v => <option key={v.id} value={v.name} />)}</datalist>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Alamat Vendor</label>
                <input type="text" value={form.vendorAddr} onChange={e => set('vendorAddr')(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ship To</label>
                <input type="text" value={form.shipTo} onChange={e => set('shipTo')(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Vessel / Kapal</label>
                <input type="text" list="vessel-list" value={form.vessel} onChange={e => set('vessel')(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                <datalist id="vessel-list">{vessels.map(v => <option key={v.id} value={v.name} />)}</datalist>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Terms</label>
                <input type="text" value={form.terms} onChange={e => set('terms')(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ship Via</label>
                <input type="text" value={form.shipVia} onChange={e => set('shipVia')(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={form.vendorTaxable} onChange={e => set('vendorTaxable')(e.target.checked)} />
                  Vendor is Taxable
                </label>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Rate PPN</label>
                <input type="number" value={form.taxRate} onChange={e => set('taxRate')(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-4">Item Pembelian</h2>
            <div className="space-y-3">
              {form.items.map((item, i) => (
                <div key={i} className="border border-gray-100 rounded-lg p-3 bg-gray-50 relative">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-3">
                      <label className="block text-xs text-gray-400 mb-1">Deskripsi</label>
                      <input type="text" list="product-list" value={item.description}
                        onChange={e => setItem(i, 'description', e.target.value)}
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300" />
                      <datalist id="product-list">{products.map(p => <option key={p.id} value={p.name} />)}</datalist>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Qty</label>
                      <input type="number" value={item.qty} onChange={e => setItem(i, 'qty', e.target.value)}
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Unit Price (IDR)</label>
                      <input type="number" value={item.unitPrice} onChange={e => setItem(i, 'unitPrice', e.target.value)}
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-300" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Amount</label>
                      <p className="px-2 py-1.5 text-sm font-mono text-blue-700">
                        {formatIDR((parseFloat(item.qty)||0)*(parseFloat(item.unitPrice)||0))}
                      </p>
                    </div>
                  </div>
                  {form.items.length > 1 && (
                    <button onClick={() => removeItem(i)} className="absolute top-2 right-2 text-red-400 text-xs">✕</button>
                  )}
                </div>
              ))}
              <button onClick={addItem}
                className="w-full border border-dashed border-gray-300 rounded-lg py-2 text-sm text-gray-400 hover:border-blue-400 hover:text-blue-500">
                + Tambah Item
              </button>
            </div>

            {/* Discount */}
            <div className="mt-4 flex items-center gap-3">
              <label className="text-xs text-gray-500 shrink-0">Discount:</label>
              <input type="number" value={form.discount} onChange={e => set('discount')(e.target.value)} placeholder="0"
                className="w-40 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
            </div>
          </div>
        </div>

        {/* Summary + History */}
        <div className="space-y-5">
          <div className="bg-white rounded-xl shadow-sm p-5 sticky top-4">
            <h2 className="font-semibold text-gray-700 mb-3">Ringkasan</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Sub Total</span><span className="font-mono">{formatIDR(subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Discount</span><span className="font-mono text-red-500">{discount > 0 ? '-' + formatIDR(discount) : formatIDR(0)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Tax (PPN {appData?.rates?.ppn || 11}%)</span><span className="font-mono">{formatIDR(taxAmt)}</span></div>
              <div className="flex justify-between font-bold text-base border-t pt-2">
                <span>Total Order</span><span className="font-mono text-blue-700">{formatIDR(totalOrder)}</span>
              </div>
            </div>
            <button onClick={saveAndPrint} disabled={saving}
              className="w-full mt-4 bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
              {saving ? '⏳' : '🖨️ Simpan & Cetak'}
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">Riwayat PO</h2>
            {loadingList ? <p className="text-gray-400 text-sm">Memuat…</p> :
             orders.length === 0 ? <p className="text-gray-400 text-sm">Belum ada PO.</p> : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {orders.map(o => (
                  <div key={o.id} className="border border-gray-100 rounded-lg p-2.5 hover:border-blue-200 cursor-pointer"
                    onClick={() => setPrinting(o)}>
                    <p className="text-xs font-mono text-blue-600">{o.docNumber}</p>
                    <p className="text-sm text-gray-700 truncate">{o.vendorName}</p>
                    <p className="text-xs text-gray-500">{formatIDR(o.totalOrder)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Print View — exact GPP PO format ────────────────────────────────────────
function POPrint({ data, company, signatories, rates }) {
  const ppnRate = (rates?.ppn || 11) / 100;
  const subtotal   = data.subtotal  || data.items?.reduce((s, it) => s + ((parseFloat(it.qty)||0)*(parseFloat(it.unitPrice)||0)), 0) || 0;
  const discount   = parseFloat(data.discount) || 0;
  const taxAmt     = data.taxAmt    || (data.vendorTaxable ? (subtotal - discount) * ppnRate : 0);
  const totalOrder = data.totalOrder || (subtotal - discount + taxAmt);

  const poDate = data.poDate ? new Date(data.poDate) : new Date();
  const poDateFmt = poDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const expDateFmt = data.expectedDate
    ? new Date(data.expectedDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return (
    <div className="bg-white font-sans" style={{ minHeight: '297mm', padding: '12mm', fontSize: '11px' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-0">
        <div className="flex items-start gap-3">
          <img src={logo} alt="GPP" style={{ width: 52, height: 52, objectFit: 'contain' }} />
          <div>
            <p className="font-bold text-gray-800 text-sm leading-tight">{company.name || 'PT GLOBAL PETRO PASIFIK'}</p>
            <p className="text-gray-600" style={{ fontSize: 9 }}>{company.address1 || 'Jl. Central Raya No.17 - Batam'}</p>
            <p className="text-gray-600" style={{ fontSize: 9 }}>{company.address2 || 'Jl. Senen Raya - Jakarta Pusat'}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-800" style={{ letterSpacing: 1 }}>Purchase Order</p>
        </div>
      </div>

      {/* PO meta box */}
      <div className="border border-gray-400 mt-2 mb-3">
        <div className="grid grid-cols-2" style={{ borderBottom: '1px solid #9ca3af' }}>
          <div className="px-3 py-1 border-r border-gray-400">
            <span className="text-gray-500">PO Date</span>
            <span className="ml-3 font-semibold">{poDateFmt}</span>
          </div>
          <div className="px-3 py-1">
            <span className="text-gray-500">PO Number</span>
            <span className="ml-3 font-semibold">{data.docNumber}</span>
          </div>
        </div>
        <div className="grid grid-cols-2" style={{ borderBottom: '1px solid #9ca3af' }}>
          <div className="px-3 py-1 border-r border-gray-400">
            <span className="text-gray-500">Terms</span>
            <span className="ml-3">{data.terms}</span>
          </div>
          <div className="px-3 py-1">
            <span className="text-gray-500">FOB</span>
            <span className="ml-3 font-semibold">Destination</span>
          </div>
        </div>
        <div className="grid grid-cols-2" style={{ borderBottom: '1px solid #9ca3af' }}>
          <div className="px-3 py-1 border-r border-gray-400">
            <span className="text-gray-500">Ship Via</span>
            <span className="ml-3">{data.shipVia}</span>
          </div>
          <div className="px-3 py-1">
            <span className="text-gray-500">Expected Date</span>
            <span className="ml-3">{expDateFmt}</span>
          </div>
        </div>
        <div className="grid grid-cols-2">
          <div className="px-3 py-1 border-r border-gray-400">
            <span className="text-gray-500">Vendor is Taxable</span>
            <span className="ml-3">{data.vendorTaxable ? 'Yes' : 'No'}</span>
          </div>
          <div className="px-3 py-1">
            <span className="text-gray-500">Rate</span>
            <span className="ml-3">{data.taxRate || 1}</span>
          </div>
        </div>
      </div>

      {/* Vendor + Ship To */}
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <p className="text-gray-500">Vendor  :</p>
          <p className="font-bold">{data.vendorName}</p>
          <p className="text-gray-600 text-xs mt-0.5 leading-snug">{data.vendorAddr}</p>
        </div>
        <div>
          <p className="text-gray-500">Ship To :</p>
          <p className="text-gray-700 leading-snug">{data.shipTo}</p>
          {data.vessel && <p className="text-gray-600 text-xs mt-0.5">{data.vessel}</p>}
        </div>
      </div>

      {/* Items table */}
      <table className="w-full mb-0" style={{ borderCollapse: 'collapse', fontSize: '11px' }}>
        <thead>
          <tr style={{ background: '#f3f4f6', borderTop: '1px solid #9ca3af', borderBottom: '1px solid #9ca3af' }}>
            <th className="px-3 py-1.5 text-left border-r border-gray-300" style={{ width: '5%' }}>No.</th>
            <th className="px-3 py-1.5 text-left border-r border-gray-300" style={{ width: '50%' }}>Description</th>
            <th className="px-3 py-1.5 text-right border-r border-gray-300" style={{ width: '15%' }}>Qty</th>
            <th className="px-3 py-1.5 text-right border-r border-gray-300" style={{ width: '15%' }}>Unit Price</th>
            <th className="px-3 py-1.5 text-right" style={{ width: '15%' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {(data.items || []).map((it, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td className="px-3 py-1.5 border-r border-gray-200">{i + 1}</td>
              <td className="px-3 py-1.5 border-r border-gray-200">{it.description}</td>
              <td className="px-3 py-1.5 border-r border-gray-200 text-right">{Number(it.qty || 0).toLocaleString('id-ID')}</td>
              <td className="px-3 py-1.5 border-r border-gray-200 text-right">{Number(it.unitPrice || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 })}</td>
              <td className="px-3 py-1.5 text-right">{Number((parseFloat(it.qty)||0)*(parseFloat(it.unitPrice)||0)).toLocaleString('id-ID', { minimumFractionDigits: 0 })}</td>
            </tr>
          ))}
          {/* Padding rows to fill space */}
          {Array.from({ length: Math.max(0, 8 - (data.items||[]).length) }).map((_, i) => (
            <tr key={`pad-${i}`} style={{ borderBottom: '1px solid #e5e7eb', height: 24 }}>
              <td className="border-r border-gray-200" /><td className="border-r border-gray-200" />
              <td className="border-r border-gray-200" /><td className="border-r border-gray-200" /><td />
            </tr>
          ))}
        </tbody>
      </table>

      {/* Say + Totals */}
      <div className="flex" style={{ borderTop: '1px solid #9ca3af', borderBottom: '1px solid #9ca3af' }}>
        <div className="flex-1 px-3 py-2 border-r border-gray-400">
          <span className="text-gray-500 mr-2">Say</span>
          <span className="italic">{terbilang(Math.round(totalOrder))}</span>
        </div>
        <div style={{ width: 180 }}>
          <div className="flex justify-between px-3 py-1 border-b border-gray-300">
            <span className="text-gray-500">Sub Total :</span>
            <span className="font-mono">{Number(subtotal).toLocaleString('id-ID')}</span>
          </div>
          <div className="flex justify-between px-3 py-1 border-b border-gray-300">
            <span className="text-gray-500">Discount :</span>
            <span className="font-mono">{Number(discount).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}</span>
          </div>
          <div className="flex justify-between px-3 py-1 border-b border-gray-300">
            <span className="text-gray-500">Tax :</span>
            <span className="font-mono">{Number(taxAmt).toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
          </div>
          <div className="flex justify-between px-3 py-2 font-bold">
            <span>Total Order :</span>
            <span className="font-mono">{Number(totalOrder).toLocaleString('id-ID', { maximumFractionDigits: 0 })}</span>
          </div>
        </div>
      </div>

      {/* Description / Notes */}
      <div className="border-b border-gray-300 px-3 py-2 min-h-8">
        <span className="text-gray-500 text-xs">Description</span>
        {data.notes && <p className="text-xs mt-1">{data.notes}</p>}
      </div>

      {/* Signatures */}
      <div className="flex gap-16 mt-6 px-3">
        <div>
          <p className="text-gray-500 text-xs">Prepared By</p>
          <div style={{ height: 48 }} />
          <div style={{ borderTop: '1px solid #374151', width: 120, marginTop: 4 }} />
          <p className="text-xs mt-1">{signatories?.preparedBy || ''}</p>
          <p className="text-xs text-gray-500 mt-2">Date: {poDateFmt}</p>
        </div>
        <div>
          <p className="text-gray-500 text-xs">Approved By</p>
          <div style={{ height: 48 }} />
          <div style={{ borderTop: '1px solid #374151', width: 120, marginTop: 4 }} />
          <p className="text-xs mt-1">{signatories?.approvedBy || ''}</p>
          <p className="text-xs text-gray-500 mt-2">Date:</p>
        </div>
      </div>
    </div>
  );
}
