import { useState, useEffect } from 'react';
import { useApp } from '../../App.jsx';
import {
  fetchCollection, createNumberedDoc,
  DOS_REF, POS_REF,
} from '../../firebase.js';
import {
  formatIDR, formatDateID, buildDONumber, buildBDRNumber, today,
} from '../../utils/utils.js';
import PrintWrapper from '../Layout/PrintWrapper.jsx';
import logo from '../../assets/gpp-logo.png';

const INIT = {
  // Link to PO (optional)
  linkedPO:       '',
  linkedPONumber: '',
  // Surat Jalan
  sjDate:           '',            // user-selectable
  customerName:     '',
  deliveryAddress:  '',
  product:          'Biosolar',
  quantity:         '',
  vessel:           '',
  driver:           '',
  departureTime:    '',
  arrivalTime:      '',
  loadingPort:      '',
  dischargingPort:  '',
  commencePump:     '',
  finishedPump:     '',
  sealNumber1:      '',
  sealNumber2:      '',
  // BDR fields
  deliveredAt:      '',
  deliveredBy:      '',           // SPOB name
  receivingVessel:  '',
  nextPort:         '',
  etd:              '',
  commencePumpBDR:  '',
  finishedPumpBDR:  '',
  // Fuel characteristics
  viscosity:        '',
  density:          '',
  flashpoint:       '',
  sulphur:          '',
  waterContent:     '',
  // Quantities
  grossVolLitres:   '',
  cubicMeter:       '',
  netMetricTons:    '',
  vcf:              '',
  wcf:              '',
  temperature:      '',
  table52:          '',
  table1:           '',
};

const PRINT_MODES = { SJ: 'sj', BDR: 'bdr' };

export default function DeliveryOrder() {
  const { appData } = useApp();
  const [form,     setForm]     = useState(INIT);
  const [orders,   setOrders]   = useState([]);
  const [pos,      setPOs]      = useState([]);
  const [printing, setPrinting] = useState(null); // { data, mode }
  const [saving,   setSaving]   = useState(false);
  const [loadingList, setLL]    = useState(true);
  const [activeTab, setTab]     = useState('sj'); // sj | bdr

  useEffect(() => {
    Promise.all([
      fetchCollection(DOS_REF()),
      fetchCollection(POS_REF()),
    ]).then(([d, p]) => { setOrders(d); setPOs(p); setLL(false); });
  }, []);

  const set = k => v => setForm(p => ({ ...p, [k]: v }));

  // When PO is selected, auto-fill common fields
  const selectPO = (po) => {
    setForm(p => ({
      ...p,
      linkedPO:       po.id,
      linkedPONumber: po.docNumber,
      customerName:   po.shipTo || '',
      product:        po.items?.[0]?.description || p.product,
      quantity:       po.items?.[0]?.qty || '',
      vessel:         po.vessel || '',
    }));
  };

  const saveAndPrint = async (mode) => {
    setSaving(true);
    try {
      const d = form.sjDate ? new Date(form.sjDate) : new Date();
      const m = d.getMonth() + 1, y = d.getFullYear();

      const { id } = await createNumberedDoc(
        'do',
        DOS_REF(),
        {
          ...form,
          sjNumber:  buildDONumber((appData?.counters?.do || 0) + 1, m, y),
          bdrNumber: buildBDRNumber((appData?.counters?.bdr || 0) + 1, m, y),
        },
        (seq) => buildDONumber(seq, m, y)
      );

      const fresh = await fetchCollection(DOS_REF());
      setOrders(fresh);
      const saved = fresh.find(o => o.id === id);
      setPrinting({ data: saved, mode });
    } finally {
      setSaving(false);
    }
  };

  const co   = appData?.company      || {};
  const sign = appData?.signatories  || {};
  const vessels  = appData?.vessels  || [];
  const products = appData?.products || [];

  const Field = ({ label, value, onChange, type = 'text', placeholder = '' }) => (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
    </div>
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {printing && (
        <PrintWrapper onClose={() => setPrinting(null)}>
          {printing.mode === PRINT_MODES.SJ
            ? <SJPrint data={printing.data} company={co} signatories={sign} />
            : <BDRPrint data={printing.data} company={co} />
          }
        </PrintWrapper>
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Delivery Order</h1>
          <p className="text-gray-500 text-sm mt-1">Surat Jalan & Bunker Delivery Receipt</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => saveAndPrint(PRINT_MODES.SJ)} disabled={saving}
            className="bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-800 disabled:opacity-50">
            {saving ? '⏳' : '🖨️ Surat Jalan'}
          </button>
          <button onClick={() => saveAndPrint(PRINT_MODES.BDR)} disabled={saving}
            className="bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
            {saving ? '⏳' : '🖨️ BDR'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <div className="xl:col-span-3 space-y-5">

          {/* Link to PO */}
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">🔗 Referensi PO (Opsional)</h2>
            {form.linkedPONumber ? (
              <div className="flex items-center gap-3 bg-blue-50 rounded-lg px-4 py-3">
                <span className="font-mono text-blue-700 text-sm">{form.linkedPONumber}</span>
                <button onClick={() => setForm(p => ({ ...p, linkedPO: '', linkedPONumber: '' }))}
                  className="text-gray-400 hover:text-red-500 text-xs ml-auto">✕ Lepas</button>
              </div>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {pos.length === 0
                  ? <p className="text-gray-400 text-sm">Belum ada PO.</p>
                  : pos.map(po => (
                    <div key={po.id}
                      onClick={() => selectPO(po)}
                      className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2 hover:border-blue-300 cursor-pointer">
                      <span className="font-mono text-xs text-blue-600">{po.docNumber}</span>
                      <span className="text-sm text-gray-600">{po.vendorName}</span>
                      <span className="text-xs text-gray-400">{Number(po.items?.[0]?.qty || 0).toLocaleString('id-ID')} L</span>
                    </div>
                  ))
                }
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="flex border-b">
              {[['sj', '📋 Surat Jalan'], ['bdr', '📊 Bunker Delivery Receipt']].map(([tab, label]) => (
                <button key={tab} onClick={() => setTab(tab)}
                  className={`px-5 py-3 text-sm font-medium transition-colors ${activeTab === tab ? 'border-b-2 border-blue-700 text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="p-5">
              {activeTab === 'sj' && (
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Tanggal Surat Jalan" value={form.sjDate} onChange={set('sjDate')} type="date" />
                  <Field label="Nama Customer" value={form.customerName} onChange={set('customerName')} />
                  <div className="col-span-2">
                    <Field label="Alamat Pengiriman" value={form.deliveryAddress} onChange={set('deliveryAddress')} />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Produk</label>
                    <input type="text" list="do-product-list" value={form.product} onChange={e => set('product')(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                    <datalist id="do-product-list">{products.map(p => <option key={p.id} value={p.name} />)}</datalist>
                  </div>
                  <Field label="Kuantitas (Liter)" value={form.quantity} onChange={set('quantity')} type="number" />
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Kapal / SPOB</label>
                    <input type="text" list="do-vessel-list" value={form.vessel} onChange={e => set('vessel')(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300" />
                    <datalist id="do-vessel-list">{vessels.map(v => <option key={v.id} value={v.name} />)}</datalist>
                  </div>
                  <Field label="Nahkoda / Supir" value={form.driver} onChange={set('driver')} />
                  <Field label="Tempat Pengisian (Loading Port)" value={form.loadingPort} onChange={set('loadingPort')} />
                  <Field label="Pelabuhan Bongkar (Discharging Port)" value={form.dischargingPort} onChange={set('dischargingPort')} />
                  <Field label="Jam Berangkat" value={form.departureTime} onChange={set('departureTime')} type="time" />
                  <Field label="Jam Tiba" value={form.arrivalTime} onChange={set('arrivalTime')} type="time" />
                  <Field label="Jam Mulai Pengaliran" value={form.commencePump} onChange={set('commencePump')} type="time" />
                  <Field label="Jam Selesai Pengaliran" value={form.finishedPump} onChange={set('finishedPump')} type="time" />
                  <Field label="Nomor Segel 1" value={form.sealNumber1} onChange={set('sealNumber1')} />
                  <Field label="Nomor Segel 2" value={form.sealNumber2} onChange={set('sealNumber2')} />
                </div>
              )}

              {activeTab === 'bdr' && (
                <div className="space-y-5">
                  {/* Delivery info */}
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Dikirim di (Delivered at)" value={form.deliveredAt} onChange={set('deliveredAt')} placeholder="e.g. Pelabuhan Loktuan, Bontang" />
                    <Field label="Dikirim oleh (SPOB)" value={form.deliveredBy} onChange={set('deliveredBy')} placeholder="e.g. SPOB Pandawa V" />
                    <Field label="Kapal Penerima" value={form.receivingVessel} onChange={set('receivingVessel')} />
                    <Field label="Next Port" value={form.nextPort} onChange={set('nextPort')} />
                    <Field label="ETD (Perkiraan Keberangkatan)" value={form.etd} onChange={set('etd')} type="datetime-local" />
                    <Field label="Tanggal BDR" value={form.sjDate} onChange={set('sjDate')} type="date" />
                    <Field label="Commence Pumping" value={form.commencePumpBDR} onChange={set('commencePumpBDR')} type="time" />
                    <Field label="Completed Pumping" value={form.finishedPumpBDR} onChange={set('finishedPumpBDR')} type="time" />
                  </div>

                  {/* Fuel Characteristics */}
                  <div>
                    <h3 className="font-medium text-sm text-gray-600 mb-3">⛽ Karakteristik Bahan Bakar</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Visc. cSt @40°C (ASTM D445/ISO 3104)" value={form.viscosity} onChange={set('viscosity')} type="number" />
                      <Field label="Density @15°C (ASTM D1298-D4052)" value={form.density} onChange={set('density')} type="number" />
                      <Field label="Flashpoint °C (ASTM D93)" value={form.flashpoint} onChange={set('flashpoint')} type="number" />
                      <Field label="Sulphur wt% (ASTM D2622)" value={form.sulphur} onChange={set('sulphur')} type="number" />
                      <Field label="Water Content % Vol. (ASTM D6304/ISO 3733)" value={form.waterContent} onChange={set('waterContent')} type="number" />
                    </div>
                  </div>

                  {/* Quantities */}
                  <div>
                    <h3 className="font-medium text-sm text-gray-600 mb-3">📦 Jumlah</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Gross Vol. Litres" value={form.grossVolLitres || form.quantity} onChange={set('grossVolLitres')} type="number" />
                      <Field label="Cubic Meter (KL)" value={form.cubicMeter} onChange={set('cubicMeter')} type="number" />
                      <Field label="Net Metric Tons" value={form.netMetricTons} onChange={set('netMetricTons')} type="number" />
                    </div>
                  </div>

                  {/* Correction Factors */}
                  <div>
                    <h3 className="font-medium text-sm text-gray-600 mb-3">📐 Correction Factors</h3>
                    <div className="grid grid-cols-3 gap-3">
                      <Field label="V.C.F (ASTM tab. 54)" value={form.vcf} onChange={set('vcf')} type="number" />
                      <Field label="W.C.F (ASTM tab. 56)" value={form.wcf} onChange={set('wcf')} type="number" />
                      <Field label="Temperature °C" value={form.temperature} onChange={set('temperature')} type="number" />
                      <Field label="Table 52" value={form.table52} onChange={set('table52')} type="number" />
                      <Field label="Table 1 (MT/LT)" value={form.table1} onChange={set('table1')} type="number" />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar: actions + history */}
        <div className="space-y-5">
          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">Cetak Dokumen</h2>
            <div className="space-y-2">
              <button onClick={() => saveAndPrint(PRINT_MODES.SJ)} disabled={saving}
                className="w-full bg-green-700 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-green-800 disabled:opacity-50">
                📋 Surat Jalan
              </button>
              <button onClick={() => saveAndPrint(PRINT_MODES.BDR)} disabled={saving}
                className="w-full bg-blue-700 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
                📊 Bunker Delivery Receipt
              </button>
              <p className="text-xs text-gray-400 text-center pt-1">Menyimpan otomatis saat cetak</p>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm p-5">
            <h2 className="font-semibold text-gray-700 mb-3">Riwayat DO</h2>
            {loadingList ? <p className="text-gray-400 text-sm">Memuat…</p> :
             orders.length === 0 ? <p className="text-gray-400 text-sm">Belum ada DO.</p> : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {orders.map(o => (
                  <div key={o.id} className="border border-gray-100 rounded-lg p-2.5">
                    <p className="text-xs font-mono text-green-600">{o.sjNumber || o.docNumber}</p>
                    <p className="text-xs font-mono text-blue-500">{o.bdrNumber}</p>
                    <p className="text-sm text-gray-700 truncate">{o.customerName}</p>
                    <p className="text-xs text-gray-400">{Number(o.quantity||0).toLocaleString('id-ID')} L</p>
                    <div className="flex gap-2 mt-1.5">
                      <button onClick={() => setPrinting({ data: o, mode: PRINT_MODES.SJ })}
                        className="flex-1 bg-green-50 border border-green-200 text-green-700 text-xs py-1 rounded hover:bg-green-100">
                        SJ
                      </button>
                      <button onClick={() => setPrinting({ data: o, mode: PRINT_MODES.BDR })}
                        className="flex-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs py-1 rounded hover:bg-blue-100">
                        BDR
                      </button>
                    </div>
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

// ─── Surat Jalan Print ────────────────────────────────────────────────────────
function SJPrint({ data, company, signatories }) {
  const sjDate = data.sjDate ? new Date(data.sjDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  const Cell = ({ label, en, value, className = '' }) => (
    <div className={`border-b border-gray-300 py-1.5 px-0 ${className}`}>
      <div className="flex gap-1">
        <div style={{ minWidth: 140 }}>
          <p className="font-semibold text-xs leading-tight">{label}</p>
          {en && <p className="text-gray-500 italic" style={{ fontSize: 9 }}>{en}</p>}
        </div>
        <span className="mr-2">:</span>
        <span className="text-xs flex-1">{value}</span>
      </div>
    </div>
  );

  return (
    <div className="bg-white font-sans" style={{ minHeight: '297mm', padding: '12mm', fontSize: '11px' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <img src={logo} alt="GPP" style={{ width: 52, height: 52, objectFit: 'contain' }} />
        <div>
          <p className="font-bold text-base">{company.name || 'GLOBAL PETRO PASIFIK'}</p>
        </div>
      </div>

      {/* Doc numbers */}
      <div className="border border-gray-400 rounded mb-3 divide-y divide-gray-300">
        <div className="flex px-3 py-1 gap-2 text-xs">
          <span className="text-gray-500 w-40">No. Pembelian</span>
          <span className="text-gray-500 italic w-40">Purchase Order No.</span>
          <span className="font-mono font-semibold">: {data.linkedPONumber || '-'}</span>
        </div>
        <div className="flex px-3 py-1 gap-2 text-xs">
          <span className="text-gray-500 w-40">No. Surat Jalan</span>
          <span className="text-gray-500 italic w-40">Delivery Order No.</span>
          <span className="font-mono font-semibold">: {data.sjNumber || data.docNumber}</span>
        </div>
        <div className="flex px-3 py-1 gap-2 text-xs">
          <span className="text-gray-500 w-40">Tanggal Surat Jalan</span>
          <span className="text-gray-500 italic w-40">Delivery Order Date</span>
          <span>: {sjDate}</span>
        </div>
      </div>

      {/* Title */}
      <div className="text-center mb-3">
        <p className="font-bold text-base tracking-widest underline">SURAT JALAN</p>
        <p className="italic text-gray-600 text-xs tracking-widest">DELIVERY ORDER</p>
      </div>

      {/* Customer */}
      <div className="mb-3">
        <Cell label="Nama Pembeli" en="Customer" value={<b>{data.customerName}</b>} />
        <Cell label="Alamat" en="Delivery Address" value={data.deliveryAddress} />
      </div>

      {/* Delivery Information */}
      <div className="text-center font-bold text-xs tracking-widest mb-2 border-t border-b border-gray-400 py-1">
        INFORMASI PENGIRIMAN &nbsp;/&nbsp; <span className="italic font-normal text-gray-500">DELIVERY INFORMATION</span>
      </div>

      <div className="grid grid-cols-2 gap-x-6 mb-4">
        <div>
          <Cell label="Produk" en="Product" value={data.product} />
          <Cell label="Kuantitas" en="Quantity" value={<><b>{Number(data.quantity||0).toLocaleString('id-ID')}</b> <span className="text-gray-500 italic">Liter</span></>} />
          <Cell label="Jam Berangkat" en="Departure Time" value={data.departureTime} />
          <Cell label="Tempat Pengisian" en="Loading Port" value={data.loadingPort} />
          <Cell label="Jam Mulai Pengaliran" en="Commence Pump" value={data.commencePump} />
          <Cell label="Nomor Segel" en="Seal Number" value={data.sealNumber1} />
          <Cell label="Nomor Segel" en="Seal Number" value={data.sealNumber2} />
        </div>
        <div>
          <Cell label="Kapal / Mobil Tangki" en="Vessel / Fuel Truck" value={data.vessel} />
          <Cell label="Nahkoda / Supir" en="Master / Driver" value={data.driver} />
          <Cell label="Jam Tiba" en="Arrival Time" value={data.arrivalTime} />
          <Cell label="Pelabuhan Bongkar" en="Discharging Port" value={data.dischargingPort} />
          <Cell label="Jam Selesai Pengaliran" en="Finished Pump" value={data.finishedPump} />
        </div>
      </div>

      {/* QC note */}
      <div className="border border-gray-300 rounded px-3 py-2 text-center text-xs text-gray-600 mb-6 italic">
        BBM tersebut telah diperiksa oleh petugas kami, diserahterimakan dengan kualitas baik dan cukup.<br />
        <span className="text-gray-400">The fuel have already checked by our officer, handover with good quality &amp; quantity.</span>
      </div>

      {/* Signatures */}
      <div className="grid grid-cols-3 gap-4 text-center text-xs">
        {[
          ['Petugas Lapangan', 'Operation Officer', signatories?.fieldOfficer],
          ['Nahkoda / Supir', 'Master / Driver', data.driver],
          ['Penerima', 'Reciever', ''],
        ].map(([label, en, name]) => (
          <div key={label}>
            <p className="font-semibold">{label}</p>
            <p className="text-gray-400 italic">{en}</p>
            <div style={{ height: 56 }} />
            <div className="border-t border-gray-400 pt-1">
              <p className="text-gray-500">Nama dan Stampel</p>
            </div>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <div className="flex justify-between mt-4 text-xs text-gray-500">
        <span>1. Lembar Asli (Putih) Untuk Penagihan</span>
        <span>2. Lembar Warna Kuning Untuk FA</span>
        <span>3. Lembar Warna Hijau Untuk Ops</span>
      </div>
    </div>
  );
}

// ─── Bunker Delivery Receipt Print ───────────────────────────────────────────
function BDRPrint({ data, company }) {
  const bdrDate = data.sjDate
    ? new Date(data.sjDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const FuelRow = ({ label, value }) => (
    <div className="flex items-center border-b border-gray-200 py-1">
      <span className="flex-1 text-xs text-gray-700 leading-tight">{label}</span>
      <span className="mx-2 text-gray-400">:</span>
      <span className="w-20 text-right font-mono text-xs font-semibold">{value}</span>
    </div>
  );

  const QtyRow = ({ label, value }) => (
    <div className="flex items-center border-b border-gray-200 py-1">
      <span className="flex-1 text-xs text-gray-700">{label}</span>
      <span className="mx-2 text-gray-400">:</span>
      <span className="w-24 text-right font-mono text-xs font-semibold">{value ? Number(value).toLocaleString('id-ID', { minimumFractionDigits: 0 }) : ''}</span>
    </div>
  );

  return (
    <div className="bg-white font-sans border border-gray-400" style={{ minHeight: 'auto', padding: '12mm', fontSize: '11px' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <img src={logo} alt="GPP" style={{ width: 48, height: 48, objectFit: 'contain' }} />
        <div>
          <p className="font-bold text-sm">{company.name || 'GLOBAL PETRO PASIFIK'}</p>
        </div>
      </div>

      {/* Title */}
      <div className="text-center mb-3">
        <p className="font-bold text-base tracking-wide">BUNKER DELIVERY RECEIPT</p>
        <div className="flex items-center justify-center gap-2 text-xs mt-1">
          <span className="text-gray-500">NO:</span>
          <span className="font-mono font-semibold border-b border-gray-400 px-8">{data.bdrNumber}</span>
        </div>
      </div>

      {/* Top info */}
      <div className="grid grid-cols-2 gap-x-6 mb-3">
        <div className="space-y-1 text-xs">
          {[
            ['Delivered at/Dikirim di', data.deliveredAt],
            ['Delivered by/Dikirim oleh', data.deliveredBy || data.vessel],
            ['Grade/Jenis Produk', data.product || 'Biosolar'],
            ['Commenced Pumping/Mulai Pemompaan', data.commencePumpBDR || data.commencePump],
            ['Completed Pumping/Selesai Pemompaan', data.finishedPumpBDR || data.finishedPump],
          ].map(([label, value]) => (
            <div key={label} className="flex border-b border-gray-200 py-0.5">
              <span className="text-gray-500 w-44 shrink-0">{label}</span>
              <span className="mx-1">:</span>
              <span className="font-semibold flex-1">{value}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1 text-xs">
          {[
            ['Date/Tanggal', bdrDate],
            ["Vessel's Name/Nama Kpl.", data.receivingVessel || data.vessel],
            ['Next Port/Pel. Lanjutan', data.nextPort],
            ['E.T.D/Perkiraan Waktu keberangkatan', data.etd ? new Date(data.etd).toLocaleString('id-ID') : ''],
          ].map(([label, value]) => (
            <div key={label} className="flex border-b border-gray-200 py-0.5">
              <span className="text-gray-500 w-44 shrink-0">{label}</span>
              <span className="mx-1">:</span>
              <span className="font-semibold flex-1">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Product Supplied */}
      <div className="text-center font-bold text-xs tracking-widest border-t border-b border-gray-400 py-1 mb-3">
        PRODUCT SUPPLIED / <span className="italic font-normal text-gray-500">Produk yang dikirim</span>
      </div>

      <div className="grid grid-cols-2 gap-x-8 mb-4">
        {/* Fuel Characteristics */}
        <div>
          <p className="font-semibold text-xs mb-1">Fuel Characteristics/<span className="italic font-normal text-gray-500">Karakteristk bahan bakar</span></p>
          <FuelRow label="Visc. cSt @40°C (ASTM D445/ISO 3104)" value={data.viscosity} />
          <FuelRow label="Density @ 15°C (ASTM D1298-D4052)" value={data.density} />
          <FuelRow label="Flashpoint °C (ASTM D93)" value={data.flashpoint} />
          <FuelRow label="Sulphur wt% (ASTM D2622/D4294/D5453)" value={data.sulphur} />
          <FuelRow label="Water Content % Vol. (ASTM D6304/ISO 3733:1999)" value={data.waterContent} />
        </div>

        {/* Quantities */}
        <div>
          <p className="font-semibold text-xs mb-1">Quantity/<span className="italic font-normal text-gray-500">Jumlah</span></p>
          <QtyRow label="Gross Vol. Litres" value={data.grossVolLitres || data.quantity} />
          <QtyRow label="Cubic Meter (KL)" value={data.cubicMeter} />
          <QtyRow label="Net Metric Tons" value={data.netMetricTons} />
          <div className="mt-2 space-y-1">
            {[
              ['V.C.F (ASTM tab. 54)', data.vcf],
              ['W.C.F (ASTM tab. 56)', data.wcf],
              ['Temperature °C', data.temperature],
              ['Table 52', data.table52],
              ['Table 1 (MT/LT)', data.table1],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center border-b border-gray-200 py-0.5">
                <span className="flex-1 text-xs text-gray-700 italic">{label}</span>
                <span className="mx-2 text-gray-400">:</span>
                <span className="w-20 text-right font-mono text-xs font-semibold text-blue-700">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Confirmations */}
      <div className="grid grid-cols-2 gap-4 border-t border-gray-400 pt-3">
        <div>
          <p className="font-bold text-xs mb-1">SUPPLIER'S CONFIRMATION/<span className="italic font-normal">Konfirmasi Pemasok</span></p>
          <p className="text-xs text-gray-600 mb-1">We confirm that the above product was delivered and that the quantities were correct.</p>
          <p className="text-xs text-gray-600 italic mb-3">Kami konfirmasikan bahwa produk diatas telah dikirim serta jumlahnya telah sesuai dan disetujui.</p>
          <p className="text-xs">FROM : <b>{company.name || 'PT. Global Petro Pasifik'}</b></p>
          <p className="text-xs text-gray-500 italic">(Company's Name)</p>
          <div style={{ height: 48 }} />
          <div className="border-t border-gray-400 pt-1 text-center">
            <p className="text-xs text-gray-500">(Cargo Officer)</p>
          </div>
        </div>
        <div>
          <p className="font-bold text-xs mb-1">MASTER'S/CHIEF ENGINEER'S/<span className="italic font-normal">Pengakuan</span><br />ACKNOWLEDGEMENT/<span className="italic font-normal">Kapten/KKM</span></p>
          <p className="text-xs text-gray-600 mb-1">We acknowledge receipt of the above product and confirm that samples were taken, sealed and numbered as follow:</p>
          <p className="text-xs text-gray-600 italic mb-2">Kami mengakui adanya penerimaan produk diatas dan mengkonfirmasikan telah diambil sample, disegel dengan nomor sebagai berikut:</p>
          <div className="text-xs space-y-0.5">
            <div className="flex"><span className="w-24 text-gray-500">Vessel/Kapal</span><span>: {data.receivingVessel || data.vessel}</span></div>
            <div className="flex"><span className="w-24 text-gray-500">Bunker Tanker</span><span>: {data.deliveredBy || data.vessel}</span></div>
            <div className="flex"><span className="w-24 text-gray-500">Acknowledged by</span><span>:</span></div>
          </div>
          <div style={{ height: 32 }} />
          <div className="border-t border-gray-400 pt-1 text-center">
            <p className="text-xs text-gray-500">(Master/Chief Engineer)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
