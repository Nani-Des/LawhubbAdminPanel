import React, { useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { useAuth } from '../contexts/AuthContext';
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import toast from 'react-hot-toast';
import { BadgeCheck, FileCheck2, XCircle } from 'lucide-react';

type VerificationStatus = 'pending' | 'approved' | 'rejected';

interface VerificationDoc {
  url?: string;
  name?: string;
}

interface VerificationRequest {
  uid: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  mobile?: string;
  status: VerificationStatus;
  documents?: {
    practiceLicence?: VerificationDoc;
    barEnrolment?: VerificationDoc;
    gbaMembership?: VerificationDoc | null;
  };
  rejectionReason?: string;
}

const LawyerVerificationsPage: React.FC = () => {
  const { currentAdmin } = useAuth();
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | VerificationStatus>('pending');
  const [queryText, setQueryText] = useState('');
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});

  React.useEffect(() => {
    const q = query(collection(db, 'LawyerVerificationRequests'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setRequests(
        snap.docs.map(
          (d) =>
            ({
              uid: d.id,
              status: 'pending',
              ...(d.data() as object),
            } as VerificationRequest)
        )
      );
    });
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      const q = queryText.trim().toLowerCase();
      if (!q) return true;
      const name = (r.fullName || `${r.firstName || ''} ${r.lastName || ''}` || '').toLowerCase();
      const email = (r.email || '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [requests, queryText, statusFilter]);

  const reviewRequest = async (request: VerificationRequest, decision: 'approved' | 'rejected') => {
    if (!currentAdmin || currentAdmin.baseRole !== 'main_admin') {
      toast.error('Only super admins can verify lawyer applications.');
      return;
    }

    const reason = (rejectionReasons[request.uid] || '').trim();
    if (decision === 'rejected' && !reason) {
      toast.error('Please provide a rejection reason.');
      return;
    }

    setBusyUid(request.uid);
    try {
      await updateDoc(doc(db, 'LawyerVerificationRequests', request.uid), {
        status: decision,
        rejectionReason: decision === 'rejected' ? reason : null,
        reviewedAt: serverTimestamp(),
        reviewedBy: currentAdmin.uid,
        updatedAt: serverTimestamp(),
      });

      if (decision === 'approved') {
        await setDoc(
          doc(db, 'Users', request.uid),
          {
            Role: true,
            Status: true,
            Designation: 'Lawyer',
            lawyerVerificationStatus: 'approved',
            lawyerVerifiedAt: serverTimestamp(),
            lawyerVerifiedBy: currentAdmin.uid,
          },
          { merge: true }
        );
        toast.success('Application approved. User account is now verified as lawyer.');
      } else {
        await setDoc(
          doc(db, 'Users', request.uid),
          {
            Role: false,
            lawyerVerificationStatus: 'rejected',
            lawyerVerificationRejectedAt: serverTimestamp(),
            lawyerVerificationRejectedBy: currentAdmin.uid,
            lawyerVerificationRejectionReason: reason,
          },
          { merge: true }
        );
        toast.success('Application rejected.');
      }
    } catch (err) {
      console.error('Failed to review verification request:', err);
      toast.error('Failed to process verification request.');
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Lawyer Verification Requests</h1>
          <p className="mt-2 text-sm text-slate-600">
            Super admins can review uploaded documents and approve or reject lawyer verification requests.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              placeholder="Search by name or email..."
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              className="sm:col-span-2"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | VerificationStatus)}
              className="h-11 rounded-xl border border-gray-300 px-3 text-sm"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>

        <div className="space-y-4">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
              No verification requests found.
            </div>
          ) : (
            filtered.map((request) => {
              const applicantName =
                request.fullName ||
                `${request.firstName || ''} ${request.lastName || ''}`.trim() ||
                'Unnamed applicant';
              const isPending = request.status === 'pending';
              const busy = busyUid === request.uid;

              return (
                <div key={request.uid} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">{applicantName}</h2>
                      <p className="text-sm text-slate-600">{request.email || 'No email'}</p>
                      <p className="text-xs text-slate-500">{request.mobile || 'No mobile number'}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        request.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-700'
                          : request.status === 'rejected'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {request.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <a
                      href={request.documents?.practiceLicence?.url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className={`rounded-xl border p-3 text-sm ${
                        request.documents?.practiceLicence?.url
                          ? 'border-slate-200 hover:border-teal-300 hover:bg-teal-50/40'
                          : 'pointer-events-none border-slate-100 bg-slate-50 text-slate-400'
                      }`}
                    >
                      <p className="font-semibold">Practising licence (GLC)</p>
                      <p className="mt-1 truncate text-xs">
                        {request.documents?.practiceLicence?.name || 'Not uploaded'}
                      </p>
                    </a>
                    <a
                      href={request.documents?.barEnrolment?.url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className={`rounded-xl border p-3 text-sm ${
                        request.documents?.barEnrolment?.url
                          ? 'border-slate-200 hover:border-teal-300 hover:bg-teal-50/40'
                          : 'pointer-events-none border-slate-100 bg-slate-50 text-slate-400'
                      }`}
                    >
                      <p className="font-semibold">Call to the Bar / enrolment</p>
                      <p className="mt-1 truncate text-xs">
                        {request.documents?.barEnrolment?.name || 'Not uploaded'}
                      </p>
                    </a>
                    <a
                      href={request.documents?.gbaMembership?.url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className={`rounded-xl border p-3 text-sm ${
                        request.documents?.gbaMembership?.url
                          ? 'border-slate-200 hover:border-teal-300 hover:bg-teal-50/40'
                          : 'pointer-events-none border-slate-100 bg-slate-50 text-slate-400'
                      }`}
                    >
                      <p className="font-semibold">GBA membership (optional)</p>
                      <p className="mt-1 truncate text-xs">
                        {request.documents?.gbaMembership?.name || 'Not uploaded'}
                      </p>
                    </a>
                  </div>

                  {request.status === 'rejected' && request.rejectionReason && (
                    <div className="mt-3 rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                      <span className="font-semibold">Rejection reason:</span> {request.rejectionReason}
                    </div>
                  )}

                  {isPending && (
                    <div className="mt-4 space-y-3">
                      <textarea
                        value={rejectionReasons[request.uid] || ''}
                        onChange={(e) =>
                          setRejectionReasons((prev) => ({ ...prev, [request.uid]: e.target.value }))
                        }
                        placeholder="Optional for approval, required for rejection."
                        className="min-h-[84px] w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-200"
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="success"
                          isLoading={busy}
                          onClick={() => void reviewRequest(request, 'approved')}
                          icon={<BadgeCheck className="h-4 w-4" />}
                        >
                          Approve as lawyer
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          isLoading={busy}
                          onClick={() => void reviewRequest(request, 'rejected')}
                          icon={<XCircle className="h-4 w-4" />}
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  )}

                  {!isPending && (
                    <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-700">
                      <FileCheck2 className="h-4 w-4" />
                      Review completed
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Layout>
  );
};

export default LawyerVerificationsPage;
