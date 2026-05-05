import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { useAuth } from '../contexts/AuthContext';
import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, storage } from '../firebase';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import toast from 'react-hot-toast';
import { BadgeCheck, ChevronDown, ChevronUp, FileCheck2, XCircle } from 'lucide-react';
import { Chamber, Practice } from '../types';
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY_CODE, countryNameFromCode } from '../constants/countries';

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
  /** ISO 3166-1 alpha-2 from application */
  countryCode?: string;
  status: VerificationStatus;
  documents?: {
    practiceLicence?: VerificationDoc;
    barEnrolment?: VerificationDoc;
    gbaMembership?: VerificationDoc | null;
  };
  rejectionReason?: string;
}

const TITLE_OPTIONS = ['Select a title', 'Esq.', 'Mr.', 'Mrs.', 'Miss.', 'Dr.'];
/** Ghana local areas — legacy field stored as `Region` on Users */
const GHANA_LOCAL_REGION_OPTIONS = [
  'Select a region',
  'Western North',
  'Western',
  'Oti',
  'Bono',
  'Bono East',
  'Ahafo',
  'Greater Accra',
  'Eastern',
  'Central',
  'Northern',
  'Savannah',
  'North East',
  'Volta',
  'Upper East',
  'Upper West',
  'Ashanti',
];

interface ApprovalFields {
  chamberId: string;
  practiceId: string;
  title: string;
  /** Ghana local region label (stored as Region on Users) */
  region: string;
  /** ISO country code */
  countryCode: string;
}

async function fetchPracticesForChamber(chamberId: string): Promise<Practice[]> {
  const chamberSnap = await getDoc(doc(db, 'Chamber', chamberId));
  if (!chamberSnap.exists()) return [];
  const data = chamberSnap.data() as Chamber;
  const ids = ((data['Chamber Practice'] || []) as unknown[]).filter((id): id is string => typeof id === 'string');
  if (!ids.length) return [];
  const practices: Practice[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    const chunk = ids.slice(i, i + 10);
    const q = query(collection(db, 'Practice'), where(documentId(), 'in', chunk));
    const snap = await getDocs(q);
    snap.forEach((d) => {
      practices.push({
        id: d.id,
        'Practice ID': d.id,
        'Practice Name': (d.data()['Practice Name'] as string) || '',
      });
    });
  }
  return practices;
}

async function uploadApprovalProfileImage(
  chamberId: string,
  uid: string,
  file: File
): Promise<string | null> {
  try {
    const timestamp = Date.now();
    const safeName = file.name.replace(/\s+/g, '_');
    const storageRef = ref(storage, `${chamberId}/lawyers/${uid}/profile_${timestamp}_${safeName}`);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
  } catch (err) {
    console.error('Profile image upload failed:', err);
    return null;
  }
}

const LawyerVerificationsPage: React.FC = () => {
  const { currentAdmin } = useAuth();
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [chambers, setChambers] = useState<Chamber[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | VerificationStatus>('pending');
  const [queryText, setQueryText] = useState('');
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});
  const [approvalFields, setApprovalFields] = useState<Record<string, ApprovalFields>>({});
  const [practiceOptionsByUid, setPracticeOptionsByUid] = useState<Record<string, Practice[]>>({});
  const [loadingPracticesForUid, setLoadingPracticesForUid] = useState<Record<string, boolean>>({});
  const [approvalImageFiles, setApprovalImageFiles] = useState<Record<string, File | null>>({});
  const [approvalImagePreview, setApprovalImagePreview] = useState<Record<string, string | null>>({});
  const [expandedByUid, setExpandedByUid] = useState<Record<string, boolean>>({});

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

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, 'Chamber'),
      (snapshot) => {
        setChambers(
          snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as Chamber[]
        );
      },
      (err) => console.error('Chamber list fetch error:', err)
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    setApprovalFields((prev) => {
      const next = { ...prev };
      for (const r of requests) {
        if (r.status === 'pending' && !next[r.uid]) {
          const fromReq = r.countryCode?.trim().toUpperCase();
          const codeOk = fromReq && COUNTRY_OPTIONS.some((c) => c.code === fromReq);
          next[r.uid] = {
            chamberId: '',
            practiceId: '',
            title: 'Select a title',
            region: 'Select a region',
            countryCode: codeOk ? fromReq! : DEFAULT_COUNTRY_CODE,
          };
        }
      }
      return next;
    });
  }, [requests]);

  useEffect(() => {
    setExpandedByUid((prev) => {
      const next = { ...prev };
      for (const r of requests) {
        if (typeof next[r.uid] === 'undefined') {
          next[r.uid] = r.status === 'pending';
        }
      }
      return next;
    });
  }, [requests]);

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

  const handleChamberChange = useCallback(async (uid: string, chamberId: string) => {
    setApprovalFields((prev) => ({
      ...prev,
      [uid]: {
        ...(prev[uid] || {
          chamberId: '',
          practiceId: '',
          title: 'Select a title',
          region: 'Select a region',
          countryCode: DEFAULT_COUNTRY_CODE,
        }),
        chamberId,
        practiceId: '',
      },
    }));
    setPracticeOptionsByUid((prev) => ({ ...prev, [uid]: [] }));
    if (!chamberId) return;
    setLoadingPracticesForUid((prev) => ({ ...prev, [uid]: true }));
    try {
      const practices = await fetchPracticesForChamber(chamberId);
      setPracticeOptionsByUid((prev) => ({ ...prev, [uid]: practices }));
    } catch (e) {
      console.error(e);
      toast.error('Could not load practices for this chamber.');
    } finally {
      setLoadingPracticesForUid((prev) => ({ ...prev, [uid]: false }));
    }
  }, []);

  const handleApprovalImageChange = useCallback((uid: string, file: File | null) => {
    if (!file) {
      setApprovalImageFiles((prev) => ({ ...prev, [uid]: null }));
      setApprovalImagePreview((prev) => ({ ...prev, [uid]: null }));
      return;
    }
    const validTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a JPEG, PNG, or GIF image');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }
    setApprovalImageFiles((prev) => ({ ...prev, [uid]: file }));
    const reader = new FileReader();
    reader.onloadend = () => {
      setApprovalImagePreview((prev) => ({ ...prev, [uid]: reader.result as string }));
    };
    reader.readAsDataURL(file);
  }, []);

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

    if (decision === 'approved') {
      const f = approvalFields[request.uid];
      if (
        !f?.chamberId ||
        !f?.practiceId ||
        !f?.title ||
        f.title === 'Select a title' ||
        !f?.region ||
        f.region === 'Select a region' ||
        !f?.countryCode
      ) {
        toast.error('Choose chamber, practice, title, country, and local region before approving.');
        return;
      }
    }

    setBusyUid(request.uid);
    let approvedPicUrl: string | undefined;
    try {
      if (decision === 'approved') {
        const f = approvalFields[request.uid]!;
        const picFile = approvalImageFiles[request.uid];
        if (picFile) {
          const uploaded = await uploadApprovalProfileImage(f.chamberId, request.uid, picFile);
          if (!uploaded) {
            toast.error('Failed to upload profile picture. Try again or remove the image.');
            return;
          }
          approvedPicUrl = uploaded;
        }
      }

      await updateDoc(doc(db, 'LawyerVerificationRequests', request.uid), {
        status: decision,
        rejectionReason: decision === 'rejected' ? reason : null,
        reviewedAt: serverTimestamp(),
        reviewedBy: currentAdmin.uid,
        updatedAt: serverTimestamp(),
      });

      if (decision === 'approved') {
        const f = approvalFields[request.uid]!;
        await setDoc(
          doc(db, 'Users', request.uid),
          {
            Role: true,
            Status: true,
            Designation: 'Lawyer',
            'Chamber ID': f.chamberId,
            'Practice ID': f.practiceId,
            Title: f.title,
            Region: f.region,
            Country: f.countryCode,
            Experience: 1,
            lawyerVerificationStatus: 'approved',
            lawyerVerifiedAt: serverTimestamp(),
            lawyerVerifiedBy: currentAdmin.uid,
            ...(approvedPicUrl ? { 'User Pic': approvedPicUrl } : {}),
          },
          { merge: true }
        );

        const scheduleRef = doc(db, 'Users', request.uid, 'Schedule', request.uid);
        const scheduleSnap = await getDoc(scheduleRef);
        if (!scheduleSnap.exists()) {
          await setDoc(scheduleRef, {
            'Active Days': 5,
            'Off Days': 2,
            Shift: 1,
            'Shift Start': Timestamp.fromDate(new Date()),
            'Shift Switch': 0,
          });
        }

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
            Super admins review documents and, when approving, assign chamber, practice, title, region, and an optional
            profile photo (these are not collected on the public signup form).
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
              const af = approvalFields[request.uid] || {
                chamberId: '',
                practiceId: '',
                title: 'Select a title',
                region: 'Select a region',
                countryCode: DEFAULT_COUNTRY_CODE,
              };
              const practiceOpts = practiceOptionsByUid[request.uid] || [];
              const loadingP = loadingPracticesForUid[request.uid];
              const isExpanded = expandedByUid[request.uid] ?? false;

              return (
                <div key={request.uid} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">{applicantName}</h2>
                      <p className="text-sm text-slate-600">{request.email || 'No email'}</p>
                      <p className="text-xs text-slate-500">{request.mobile || 'No mobile number'}</p>
                      {request.countryCode ? (
                        <p className="text-xs text-slate-500">
                          Country: {countryNameFromCode(request.countryCode)} ({request.countryCode})
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
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
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedByUid((prev) => ({
                            ...prev,
                            [request.uid]: !(prev[request.uid] ?? false),
                          }))
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? 'Collapse' : 'Expand'}
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <>
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
                          <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4">
                            <p className="mb-3 text-sm font-semibold text-slate-800">Assignment when approving</p>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <Select
                                label="Chamber"
                                value={af.chamberId}
                                onChange={(value) => void handleChamberChange(request.uid, value)}
                                options={[
                                  { value: '', label: 'Select chamber' },
                                  ...chambers.map((c) => ({
                                    value: c.id,
                                    label: String(c['Chamber Name'] || c.name || c.id),
                                  })),
                                ]}
                              />
                              <Select
                                label="Practice"
                                value={af.practiceId}
                                disabled={!af.chamberId || !!loadingP}
                                onChange={(value) =>
                                  setApprovalFields((prev) => ({
                                    ...prev,
                                    [request.uid]: {
                                      ...(prev[request.uid] || af),
                                      practiceId: value,
                                    },
                                  }))
                                }
                                options={[
                                  {
                                    value: '',
                                    label: loadingP
                                      ? 'Loading practices…'
                                      : af.chamberId
                                        ? 'Select practice'
                                        : 'Select a chamber first',
                                  },
                                  ...practiceOpts.map((p) => ({
                                    value: p.id,
                                    label: p['Practice Name'] || p['Practice ID'] || p.id,
                                  })),
                                ]}
                              />
                              <Select
                                label="Title"
                                value={af.title}
                                onChange={(value) =>
                                  setApprovalFields((prev) => ({
                                    ...prev,
                                    [request.uid]: { ...(prev[request.uid] || af), title: value },
                                  }))
                                }
                                options={TITLE_OPTIONS.map((t) => ({ value: t, label: t }))}
                              />
                              <Select
                                label="Country"
                                value={af.countryCode}
                                onChange={(value) =>
                                  setApprovalFields((prev) => ({
                                    ...prev,
                                    [request.uid]: { ...(prev[request.uid] || af), countryCode: value },
                                  }))
                                }
                                options={COUNTRY_OPTIONS.map((c) => ({
                                  value: c.code,
                                  label: `${c.name} (${c.code})`,
                                }))}
                              />
                              <Select
                                label="State / region (local)"
                                value={af.region}
                                onChange={(value) =>
                                  setApprovalFields((prev) => ({
                                    ...prev,
                                    [request.uid]: { ...(prev[request.uid] || af), region: value },
                                  }))
                                }
                                options={GHANA_LOCAL_REGION_OPTIONS.map((r) => ({ value: r, label: r }))}
                              />
                              <div className="sm:col-span-2">
                                <label className="mb-1 block text-sm font-medium text-gray-700">
                                  Profile picture <span className="font-normal text-slate-500">(optional)</span>
                                </label>
                                <input
                                  type="file"
                                  accept="image/jpeg,image/png,image/gif"
                                  onChange={(e) =>
                                    handleApprovalImageChange(request.uid, e.target.files?.[0] || null)
                                  }
                                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                />
                                {approvalImagePreview[request.uid] ? (
                                  <img
                                    src={approvalImagePreview[request.uid]!}
                                    alt="Preview"
                                    className="mt-2 h-20 w-20 rounded-full border border-slate-200 object-cover"
                                  />
                                ) : null}
                              </div>
                            </div>
                            {af.chamberId && !loadingP && practiceOpts.length === 0 ? (
                              <p className="mt-2 text-xs text-amber-800">
                                This chamber has no practices linked yet. Add practices under chamber settings before
                                approving.
                              </p>
                            ) : null}
                          </div>
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
                    </>
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
