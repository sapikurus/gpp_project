import { useState } from 'react';
import { canApprove, canSubmit, statusMeta, isApproved } from '../../utils/approvalUtils.js';
import { formatDateShort } from '../../utils/utils.js';

// Diagonal DRAFT watermark — shown in print view when not approved
export function DraftWatermark({ status }) {
  if (isApproved(status)) return null;
  return (
    <div className="fixed inset-0 pointer-events-none flex items-center justify-center"
      style={{ zIndex: 100, transform: 'rotate(-35deg)' }}>
      <span className="text-gray-200 font-black select-none"
        style={{ fontSize: '96px', letterSpacing: '0.2em', opacity: 0.4 }}>
        DRAFT
      </span>
    </div>
  );
}

// Status badge — use anywhere in list views
export function StatusBadge({ status }) {
  const m = statusMeta(status);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${m.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

// Full approval panel — embedded in document detail/card
export default function ApprovalPanel({
  doc,              // the document object
  docType,          // 'po' | 'so' | 'ol'
  chain,            // ['manager','director'] from getChain()
  userRole,         // current user's role
  userEmail,        // current user's email
  onSubmit,         // () => void — submits for approval
  onApprove,        // (note) => void
  onReject,         // (note) => void
  saving = false,
}) {
  const [note, setNote] = useState('');
  const [showReject, setShowReject] = useState(false);
  const status = doc?.approvalStatus || 'draft';
  const history = doc?.approvalHistory || [];
  const m = statusMeta(status);

  const userCanApprove = canApprove(userRole, status, chain);
  const userCanSubmit  = canSubmit(status);

  const handleApprove = () => { onApprove(note); setNote(''); };
  const handleReject  = () => { onReject(note);  setNote(''); setShowReject(false); };

  return (
    <div className="bg-white rounded-xl shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-700 text-sm">Status Persetujuan</h3>
        <StatusBadge status={status} />
      </div>

      {/* Approval chain progress */}
      <div className="flex items-center gap-2 mb-4">
        <div className={`flex-1 h-1.5 rounded-full ${status === 'draft' || status === 'rejected' ? 'bg-gray-200' : 'bg-blue-200'}`} />
        {chain.map((role, i) => {
          const isDone   = history.some(h => h.role === role && h.action === 'approved');
          const isPending = status === `pending_${role}`;
          return (
            <div key={role} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                isDone   ? 'bg-green-500 border-green-500 text-white' :
                isPending ? 'bg-yellow-400 border-yellow-400 text-white animate-pulse' :
                            'bg-white border-gray-300 text-gray-400'
              }`}>
                {isDone ? '✓' : i + 1}
              </div>
              <span className="text-xs text-gray-500 capitalize hidden sm:inline">
                {role === 'director' ? 'Direktur' : role === 'manager' ? 'Manager' : role}
              </span>
              {i < chain.length - 1 && <div className={`h-1.5 w-8 rounded-full ${isDone ? 'bg-green-400' : 'bg-gray-200'}`} />}
            </div>
          );
        })}
        <div className={`flex-1 h-1.5 rounded-full ${isApproved(status) ? 'bg-green-400' : 'bg-gray-200'}`} />
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="space-y-2 mb-4">
          {history.map((h, i) => (
            <div key={i} className={`flex items-start gap-2.5 text-xs rounded-lg px-3 py-2 ${
              h.action === 'approved' ? 'bg-green-50' : h.action === 'rejected' ? 'bg-red-50' : 'bg-gray-50'
            }`}>
              <span className={h.action === 'approved' ? 'text-green-500' : h.action === 'rejected' ? 'text-red-500' : 'text-gray-400'}>
                {h.action === 'approved' ? '✓' : h.action === 'rejected' ? '✕' : '→'}
              </span>
              <div>
                <span className="font-semibold text-gray-700 capitalize">
                  {h.role === 'director' ? 'Direktur' : h.role === 'manager' ? 'Manager' : h.role}
                </span>
                <span className={`ml-1 ${h.action === 'approved' ? 'text-green-600' : 'text-red-600'}`}>
                  {h.action === 'approved' ? 'menyetujui' : 'menolak'}
                </span>
                <span className="text-gray-400 ml-1">· {h.by} · {new Date(h.at).toLocaleDateString('id-ID', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}</span>
                {h.note && <p className="text-gray-500 mt-0.5 italic">"{h.note}"</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rejection reason banner */}
      {status === 'rejected' && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4 text-xs text-red-700">
          <b>Ditolak</b> — {history.findLast?.(h => h.action === 'rejected')?.note || 'Tanpa catatan'}
        </div>
      )}

      {/* Submit button */}
      {userCanSubmit && !userCanApprove && (
        <button onClick={onSubmit} disabled={saving}
          className="w-full bg-blue-700 text-white py-2 rounded-lg text-sm font-semibold hover:bg-blue-800 disabled:opacity-50">
          {saving ? '⏳' : '📤 Ajukan untuk Persetujuan'}
        </button>
      )}

      {/* Approve / Reject buttons */}
      {userCanApprove && (
        <div className="space-y-2">
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2}
            placeholder="Catatan (opsional)..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none" />
          <div className="flex gap-2">
            <button onClick={handleApprove} disabled={saving}
              className="flex-1 bg-green-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
              {saving ? '⏳' : '✓ Setujui'}
            </button>
            <button onClick={() => setShowReject(r => !r)} disabled={saving}
              className="flex-1 border border-red-200 text-red-600 py-2 rounded-lg text-sm font-semibold hover:bg-red-50 disabled:opacity-50">
              ✕ Tolak
            </button>
          </div>
          {showReject && (
            <button onClick={handleReject} disabled={saving || !note.trim()}
              className="w-full bg-red-600 text-white py-2 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50">
              Konfirmasi Tolak
            </button>
          )}
        </div>
      )}

      {isApproved(status) && (
        <div className="flex items-center gap-2 text-green-600 text-sm font-semibold">
          <span className="text-lg">✅</span> Dokumen telah disetujui penuh
        </div>
      )}
    </div>
  );
}
