import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../components/layout/Layout';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { useAuth } from '../contexts/AuthContext';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { db, storage } from '../firebase';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import toast from 'react-hot-toast';
import { BadgeCheck, ChevronDown, ChevronUp, FileCheck2, XCircle } from 'lucide-react';
import { Chamber, Practice } from '../types';
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY_CODE, countryNameFromCode } from '../constants/countries';
import { NA_CHAMBER_NAME, resolveNaChamberId } from '../constants/chamberConstants';
import {
  regionFieldLabel,
} from '../constants/countryRegions';
import {
  applicantHasChamberInfo,
  chamberDisplayName,
  collectApplicantPracticeNames,
  createChamber,
  ensurePracticeOnChamber,
  fetchPracticesForChamber,
  findSimilarChambers,
  findSimilarPractices,
  linkPracticeToChamber,
  practiceDisplayName,
  suggestChamberIdFromName,
  suggestPracticeIdFromName,
} from '../utils/chamberProvisioning';
import { toTitleCase } from '../utils/stringSimilarity';

type VerificationStatus = 'pending' | 'approved' | 'rejected';

type ChamberAssignMode = 'na' | 'listed' | 'custom_existing' | 'custom_new';

interface CustomPracticeDraft {
  sourceName: string;
  mode: 'existing' | 'new';
  practiceId: string;
  editedName: string;
}

interface NewChamberDraft {
  chamberId: string;
  chamberName: string;
  location: string;
  city: string;
  countryCode: string;
  contact: string;
  email: string;
}

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
  /** Applicant nationality (ISO alpha-2) */
  nationality?: string;
  /** Applicant local region / state / province */
  region?: string;
  /** Applicant's preferred chamber (from mobile/web signup) */
  chamberId?: string;
  chamberName?: string;
  practiceId?: string;
  practiceName?: string;
  /** Custom chamber name typed by applicant (not an official chamber) */
  altChamber?: string;
  /** Additional practice names (typed or extra selections) */
  altPractice?: string[];
  status: VerificationStatus;
  documents?: {
    practiceLicence?: VerificationDoc;
    barEnrolment?: VerificationDoc;
    gbaMembership?: VerificationDoc | null;
  };
  rejectionReason?: string;
}

const TITLE_OPTIONS = ['Select a title', 'Esq.', 'Mr.', 'Mrs.', 'Miss.', 'Dr.'];

interface ApprovalFields {
  chamberId: string;
  practiceId: string;
  title: string;
  /** ISO country code (international region) */
  region: string;
  countryCode: string;
  nationality: string;
  chamberAssignMode: ChamberAssignMode;
  newChamber: NewChamberDraft;
  customPracticeDrafts: CustomPracticeDraft[];
}

function defaultNewChamberDraft(request?: VerificationRequest): NewChamberDraft {
  const rawName = request?.altChamber?.trim() || request?.chamberName?.trim() || '';
  const fromReq = request?.countryCode?.trim().toUpperCase();
  const countryCode =
    fromReq && COUNTRY_OPTIONS.some((c) => c.code === fromReq) ? fromReq : DEFAULT_COUNTRY_CODE;
  return {
    chamberId: suggestChamberIdFromName(rawName),
    chamberName: rawName ? toTitleCase(rawName) : '',
    location: '',
    city: '',
    countryCode,
    contact: request?.mobile?.trim() || '',
    email: request?.email?.trim() || '',
  };
}

function defaultApprovalFields(request: VerificationRequest): ApprovalFields {
  const fromReq = request.countryCode?.trim().toUpperCase();
  const codeOk = fromReq && COUNTRY_OPTIONS.some((c) => c.code === fromReq);
  const natReq = request.nationality?.trim().toUpperCase();
  const natOk = natReq && COUNTRY_OPTIONS.some((c) => c.code === natReq);
  const countryCode = codeOk ? fromReq! : DEFAULT_COUNTRY_CODE;
  const hasChamber = applicantHasChamberInfo(request);
  const customNames = collectApplicantPracticeNames(request);

  let chamberAssignMode: ChamberAssignMode = 'listed';
  if (!hasChamber) {
    chamberAssignMode = 'na';
  } else if (request.altChamber?.trim() || (!request.chamberId && request.chamberName?.trim())) {
    chamberAssignMode = 'custom_new';
  } else if (request.chamberId) {
    chamberAssignMode = 'listed';
  }

  return {
    chamberId: request.chamberId || '',
    practiceId: request.practiceId || '',
    title: 'Select a title',
    region: natOk ? natReq! : countryCode,
    countryCode,
    nationality: natOk ? natReq! : countryCode,
    chamberAssignMode,
    newChamber: defaultNewChamberDraft(request),
    customPracticeDrafts: customNames.map((name) => ({
      sourceName: name,
      mode: 'new',
      practiceId: suggestPracticeIdFromName(name),
      editedName: toTitleCase(name),
    })),
  };
}

function isValidCountryCode(code: string): boolean {
  return COUNTRY_OPTIONS.some((c) => c.code === code.trim().toUpperCase());
}

function hasLawyerVerificationAccess(
  permissions: string[] | { [key: string]: boolean } | undefined,
  baseRole?: string
): boolean {
  if (baseRole === 'main_admin') return true;
  if (!permissions) return false;
  if (Array.isArray(permissions)) return permissions.includes('lawyer_verifications');
  return permissions.lawyer_verifications === true;
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
          next[r.uid] = defaultApprovalFields(r);
        }
      }
      return next;
    });
  }, [requests]);

  const loadPracticeOptionsForUid = useCallback(async (uid: string, chamberId: string) => {
    if (!chamberId) return;
    setLoadingPracticesForUid((prev) => ({ ...prev, [uid]: true }));
    try {
      const practices = await fetchPracticesForChamber(chamberId);
      setPracticeOptionsByUid((prev) => ({ ...prev, [uid]: practices }));
    } catch (e) {
      console.error(e);
      toast.error('Could not load Practice Areas for this chamber.');
    } finally {
      setLoadingPracticesForUid((prev) => ({ ...prev, [uid]: false }));
    }
  }, []);

  useEffect(() => {
    void (async () => {
      for (const r of requests) {
        if (r.status !== 'pending' || applicantHasChamberInfo(r)) continue;
        const current = approvalFields[r.uid];
        if (current?.chamberId) continue;
        const naId = await resolveNaChamberId();
        if (!naId) continue;
        setApprovalFields((prev) => ({
          ...prev,
          [r.uid]: {
            ...(prev[r.uid] || defaultApprovalFields(r)),
            chamberAssignMode: 'na',
            chamberId: naId,
          },
        }));
        if (!practiceOptionsByUid[r.uid] && !loadingPracticesForUid[r.uid]) {
          void loadPracticeOptionsForUid(r.uid, naId);
        }
      }
    })();
  }, [requests, approvalFields, practiceOptionsByUid, loadingPracticesForUid, loadPracticeOptionsForUid]);

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

  useEffect(() => {
    for (const r of requests) {
      if (r.status !== 'pending') continue;
      const af = approvalFields[r.uid];
      if (!af?.chamberId) continue;
      if (practiceOptionsByUid[r.uid] != null || loadingPracticesForUid[r.uid]) continue;
      if (af.chamberAssignMode === 'custom_new') continue;
      void loadPracticeOptionsForUid(r.uid, af.chamberId);
    }
  }, [requests, approvalFields, practiceOptionsByUid, loadingPracticesForUid, loadPracticeOptionsForUid]);

  const handleChamberChange = useCallback(async (uid: string, chamberId: string) => {
    setApprovalFields((prev) => ({
      ...prev,
      [uid]: {
        ...(prev[uid] || defaultApprovalFields(requests.find((r) => r.uid === uid)!)),
        chamberAssignMode: 'listed',
        chamberId,
        practiceId: '',
      },
    }));
    setPracticeOptionsByUid((prev) => ({ ...prev, [uid]: [] }));
    if (!chamberId) return;
    await loadPracticeOptionsForUid(uid, chamberId);
  }, [loadPracticeOptionsForUid, requests]);

  const selectExistingChamberSuggestion = useCallback(
    async (uid: string, chamberId: string) => {
      setApprovalFields((prev) => ({
        ...prev,
        [uid]: {
          ...(prev[uid]!),
          chamberAssignMode: 'custom_existing',
          chamberId,
          practiceId: '',
        },
      }));
      setPracticeOptionsByUid((prev) => ({ ...prev, [uid]: [] }));
      await loadPracticeOptionsForUid(uid, chamberId);
    },
    [loadPracticeOptionsForUid]
  );

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
    if (!hasLawyerVerificationAccess(currentAdmin?.permissions, currentAdmin?.baseRole)) {
      toast.error('You do not have permission to verify lawyer applications.');
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
        !f?.practiceId ||
        !f?.title ||
        f.title === 'Select a title' ||
        !f?.countryCode ||
        !f?.nationality ||
        !isValidCountryCode(f.region)
      ) {
        toast.error('Choose Practice Area, title, nationality, country of practice, and country/region before approving.');
        return;
      }

      if (f.chamberAssignMode === 'custom_new') {
        const nc = f.newChamber;
        if (
          !nc.chamberId.trim() ||
          !nc.chamberName.trim() ||
          !nc.location.trim() ||
          !nc.city.trim() ||
          !nc.contact.trim() ||
          !nc.countryCode
        ) {
          toast.error('Complete all required fields for the new chamber before approving.');
          return;
        }
      } else if (!f.chamberId) {
        toast.error('Choose or create a chamber before approving.');
        return;
      }
    }

    setBusyUid(request.uid);
    let approvedPicUrl: string | undefined;
    try {
      let resolvedChamberId = '';
      let provisionSummary = '';

      if (decision === 'approved') {
        const f = approvalFields[request.uid]!;

        if (f.chamberAssignMode === 'na') {
          const naId = await resolveNaChamberId();
          if (!naId) {
            toast.error(`Could not find "${NA_CHAMBER_NAME}". Create it in Firestore first.`);
            return;
          }
          resolvedChamberId = naId;
        } else if (f.chamberAssignMode === 'custom_new') {
          const nc = f.newChamber;
          await createChamber({
            chamberId: nc.chamberId.trim(),
            chamberName: nc.chamberName.trim(),
            location: nc.location.trim(),
            city: nc.city.trim(),
            countryCode: nc.countryCode,
            contact: nc.contact.trim(),
            email: nc.email.trim(),
          });
          resolvedChamberId = nc.chamberId.trim();
          provisionSummary = `Created chamber "${toTitleCase(nc.chamberName)}". `;
        } else {
          resolvedChamberId = f.chamberId;
        }

        for (const draft of f.customPracticeDrafts) {
          if (draft.mode === 'existing' && draft.practiceId) {
            await linkPracticeToChamber(resolvedChamberId, draft.practiceId);
          } else {
            await ensurePracticeOnChamber(
              resolvedChamberId,
              draft.editedName.trim() || draft.sourceName,
              draft.practiceId.trim()
            );
          }
        }

        const picFile = approvalImageFiles[request.uid];
        if (picFile) {
          const uploaded = await uploadApprovalProfileImage(resolvedChamberId, request.uid, picFile);
          if (!uploaded) {
            toast.error('Failed to upload profile picture. Try again or remove the image.');
            return;
          }
          approvedPicUrl = uploaded;
        }

        await updateDoc(doc(db, 'LawyerVerificationRequests', request.uid), {
          status: decision,
          rejectionReason: null,
          reviewedAt: serverTimestamp(),
          reviewedBy: currentAdmin.uid,
          updatedAt: serverTimestamp(),
          approvedChamberId: resolvedChamberId,
        });

        await setDoc(
          doc(db, 'Users', request.uid),
          {
            Role: true,
            Status: true,
            Designation: 'Lawyer',
            'Chamber ID': resolvedChamberId,
            'Practice ID': f.practiceId,
            Title: f.title,
            Region: countryNameFromCode(f.region),
            Country: f.countryCode,
            Nationality: f.nationality,
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

        toast.success(`${provisionSummary}Application approved. Lawyer verified.`);
      } else {
        await updateDoc(doc(db, 'LawyerVerificationRequests', request.uid), {
          status: decision,
          rejectionReason: reason,
          reviewedAt: serverTimestamp(),
          reviewedBy: currentAdmin.uid,
          updatedAt: serverTimestamp(),
        });

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
      toast.error(err instanceof Error ? err.message : 'Failed to process verification request.');
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
            Review submitted documents and approve or reject applications. When approving, confirm chamber,
            practice, title, region, and an optional profile photo. Applicants may indicate a preferred
            chamber and practice during registration, including custom names that are not yet on the platform.
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
              const af = approvalFields[request.uid] || defaultApprovalFields(request);
              const practiceOpts = practiceOptionsByUid[request.uid] || [];
              const loadingP = loadingPracticesForUid[request.uid];
              const isExpanded = expandedByUid[request.uid] ?? false;
              const chamberQuery =
                request.altChamber?.trim() || request.chamberName?.trim() || '';
              const chamberSuggestions = chamberQuery
                ? findSimilarChambers(chamberQuery, chambers)
                : [];
              const showCustomChamberPanel =
                af.chamberAssignMode === 'custom_new' || af.chamberAssignMode === 'custom_existing';
              const draftPracticeOptions = af.customPracticeDrafts
                .filter((d) => d.mode === 'new' || !practiceOpts.some((p) => p.id === d.practiceId))
                .map((d) => ({
                  value: d.practiceId,
                  label: `(new) ${d.editedName || d.sourceName}`,
                }));
              const noChamberInfo = !applicantHasChamberInfo(request);

              return (
                <div key={request.uid} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-900">{applicantName}</h2>
                      <p className="text-sm text-slate-600">{request.email || 'No email'}</p>
                      <p className="text-xs text-slate-500">{request.mobile || 'No mobile number'}</p>
                      {request.countryCode ? (
                        <p className="text-xs text-slate-500">
                          Country of practice: {countryNameFromCode(request.countryCode)} ({request.countryCode})
                        </p>
                      ) : null}
                      {request.nationality ? (
                        <p className="text-xs text-slate-500">
                          Nationality: {countryNameFromCode(request.nationality)} ({request.nationality})
                        </p>
                      ) : null}
                      {request.region ? (
                        <p className="text-xs text-slate-500">
                          {regionFieldLabel(request.countryCode)}: {request.region}
                        </p>
                      ) : null}
                      {request.chamberName || request.chamberId ? (
                        <p className="text-xs text-slate-500">
                          Preferred chamber: {request.chamberName || request.chamberId}
                        </p>
                      ) : null}
                      {request.altChamber ? (
                        <p className="text-xs text-amber-700">
                          Custom chamber (not on platform): {request.altChamber}
                        </p>
                      ) : null}
                      {request.practiceName || request.practiceId ? (
                        <p className="text-xs text-slate-500">
                          Primary Practice Area: {request.practiceName || request.practiceId}
                        </p>
                      ) : null}
                      {request.altPractice && request.altPractice.length > 0 ? (
                        <p className="text-xs text-amber-700">
                          Additional Practice Areas: {request.altPractice.join(', ')}
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
                          {(request.altChamber ||
                            (request.altPractice && request.altPractice.length > 0) ||
                            request.chamberName ||
                            request.practiceName) && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
                              <p className="mb-2 text-sm font-semibold text-slate-800">
                                Applicant preferences (confirm during approval)
                              </p>
                              <ul className="space-y-1 text-xs text-slate-700">
                                {request.chamberName || request.chamberId ? (
                                  <li>
                                    <span className="font-medium">Listed chamber:</span>{' '}
                                    {request.chamberName || request.chamberId}
                                  </li>
                                ) : null}
                                {request.altChamber ? (
                                  <li>
                                    <span className="font-medium">Custom chamber:</span> {request.altChamber}
                                    <span className="text-amber-800">
                                      {' '}
                                      (will become an official chamber on approval, or link to a similar one)
                                    </span>
                                  </li>
                                ) : null}
                                {!applicantHasChamberInfo(request) ? (
                                  <li>
                                    <span className="font-medium">No chamber provided:</span>{' '}
                                    will assign to {NA_CHAMBER_NAME}
                                  </li>
                                ) : null}
                                {request.practiceName || request.practiceId ? (
                                  <li>
                                    <span className="font-medium">Primary Practice Area:</span>{' '}
                                    {request.practiceName || request.practiceId}
                                  </li>
                                ) : null}
                                {request.nationality ? (
                                  <li>
                                    <span className="font-medium">Nationality:</span>{' '}
                                    {countryNameFromCode(request.nationality)} ({request.nationality})
                                  </li>
                                ) : null}
                                {request.region ? (
                                  <li>
                                    <span className="font-medium">{regionFieldLabel(request.countryCode)}:</span>{' '}
                                    {request.region}
                                  </li>
                                ) : null}
                                {request.altPractice && request.altPractice.length > 0 ? (
                                  <li>
                                    <span className="font-medium">Additional Practice Areas:</span>{' '}
                                    {request.altPractice.join(', ')}
                                  </li>
                                ) : null}
                              </ul>
                            </div>
                          )}
                          <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-4">
                            <p className="mb-3 text-sm font-semibold text-slate-800">Assignment when approving</p>

                            {noChamberInfo ? (
                              <p className="mb-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                                No chamber on application — lawyer will be assigned to{' '}
                                <strong>{NA_CHAMBER_NAME}</strong>.
                              </p>
                            ) : null}

                            {showCustomChamberPanel && (
                              <div className="mb-4 space-y-3 rounded-lg border border-amber-200 bg-white p-3">
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={af.chamberAssignMode === 'custom_new' ? 'primary' : 'outline'}
                                    onClick={() =>
                                      setApprovalFields((prev) => ({
                                        ...prev,
                                        [request.uid]: {
                                          ...(prev[request.uid] || af),
                                          chamberAssignMode: 'custom_new',
                                          chamberId: '',
                                        },
                                      }))
                                    }
                                  >
                                    Create new chamber
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={af.chamberAssignMode === 'custom_existing' ? 'primary' : 'outline'}
                                    onClick={() =>
                                      setApprovalFields((prev) => ({
                                        ...prev,
                                        [request.uid]: {
                                          ...(prev[request.uid] || af),
                                          chamberAssignMode: 'custom_existing',
                                        },
                                      }))
                                    }
                                  >
                                    Use existing chamber
                                  </Button>
                                </div>

                                {chamberSuggestions.length > 0 && (
                                  <div>
                                    <p className="mb-1 text-xs font-medium text-slate-700">
                                      Similar chambers on platform
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {chamberSuggestions.map(({ item, score }) => (
                                        <button
                                          key={item.id}
                                          type="button"
                                          onClick={() =>
                                            void selectExistingChamberSuggestion(request.uid, item.id)
                                          }
                                          className="rounded-lg border border-teal-200 bg-teal-50 px-2 py-1 text-xs text-teal-900 hover:bg-teal-100"
                                        >
                                          {chamberDisplayName(item)} ({Math.round(score * 100)}% match)
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {af.chamberAssignMode === 'custom_new' ? (
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <Input
                                      label="Chamber name"
                                      value={af.newChamber.chamberName}
                                      onChange={(e) =>
                                        setApprovalFields((prev) => ({
                                          ...prev,
                                          [request.uid]: {
                                            ...(prev[request.uid] || af),
                                            newChamber: {
                                              ...af.newChamber,
                                              chamberName: e.target.value,
                                              chamberId: suggestChamberIdFromName(e.target.value),
                                            },
                                          },
                                        }))
                                      }
                                    />
                                    <Input
                                      label="Chamber ID"
                                      value={af.newChamber.chamberId}
                                      onChange={(e) =>
                                        setApprovalFields((prev) => ({
                                          ...prev,
                                          [request.uid]: {
                                            ...(prev[request.uid] || af),
                                            newChamber: { ...af.newChamber, chamberId: e.target.value },
                                          },
                                        }))
                                      }
                                      helperText="Firestore document ID (same as Chamber ID field)"
                                    />
                                    <Input
                                      label="Location"
                                      value={af.newChamber.location}
                                      onChange={(e) =>
                                        setApprovalFields((prev) => ({
                                          ...prev,
                                          [request.uid]: {
                                            ...(prev[request.uid] || af),
                                            newChamber: { ...af.newChamber, location: e.target.value },
                                          },
                                        }))
                                      }
                                      className="sm:col-span-2"
                                    />
                                    <Input
                                      label="City"
                                      value={af.newChamber.city}
                                      onChange={(e) =>
                                        setApprovalFields((prev) => ({
                                          ...prev,
                                          [request.uid]: {
                                            ...(prev[request.uid] || af),
                                            newChamber: { ...af.newChamber, city: e.target.value },
                                          },
                                        }))
                                      }
                                    />
                                    <Select
                                      label="Country"
                                      value={af.newChamber.countryCode}
                                      onChange={(value) =>
                                        setApprovalFields((prev) => ({
                                          ...prev,
                                          [request.uid]: {
                                            ...(prev[request.uid] || af),
                                            newChamber: { ...af.newChamber, countryCode: value },
                                          },
                                        }))
                                      }
                                      options={COUNTRY_OPTIONS.map((c) => ({
                                        value: c.code,
                                        label: `${c.name} (${c.code})`,
                                      }))}
                                    />
                                    <Input
                                      label="Contact"
                                      value={af.newChamber.contact}
                                      onChange={(e) =>
                                        setApprovalFields((prev) => ({
                                          ...prev,
                                          [request.uid]: {
                                            ...(prev[request.uid] || af),
                                            newChamber: { ...af.newChamber, contact: e.target.value },
                                          },
                                        }))
                                      }
                                    />
                                    <Input
                                      label="Email"
                                      value={af.newChamber.email}
                                      onChange={(e) =>
                                        setApprovalFields((prev) => ({
                                          ...prev,
                                          [request.uid]: {
                                            ...(prev[request.uid] || af),
                                            newChamber: { ...af.newChamber, email: e.target.value },
                                          },
                                        }))
                                      }
                                    />
                                  </div>
                                ) : (
                                  <Select
                                    label="Existing chamber"
                                    value={af.chamberId}
                                    onChange={(value) =>
                                      void selectExistingChamberSuggestion(request.uid, value)
                                    }
                                    options={[
                                      { value: '', label: 'Select chamber' },
                                      ...chambers.map((c) => ({
                                        value: c.id,
                                        label: chamberDisplayName(c),
                                      })),
                                    ]}
                                  />
                                )}
                              </div>
                            )}

                            {af.customPracticeDrafts.length > 0 && (
                              <div className="mb-4 space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                                <p className="text-sm font-medium text-slate-800">Custom Practice Areas to add</p>
                                {af.customPracticeDrafts.map((draft, draftIdx) => {
                                  const similar = findSimilarPractices(
                                    draft.editedName || draft.sourceName,
                                    practiceOpts
                                  );
                                  return (
                                    <div
                                      key={`${draft.sourceName}-${draftIdx}`}
                                      className="grid gap-2 rounded border border-slate-100 p-2 sm:grid-cols-2"
                                    >
                                      <Input
                                        label={`Practice Area Name (applicant: ${draft.sourceName})`}
                                        value={draft.editedName}
                                        onChange={(e) => {
                                          const editedName = e.target.value;
                                          setApprovalFields((prev) => {
                                            const current = prev[request.uid] || af;
                                            const drafts = [...current.customPracticeDrafts];
                                            drafts[draftIdx] = {
                                              ...drafts[draftIdx],
                                              editedName,
                                              mode: 'new',
                                              practiceId: suggestPracticeIdFromName(editedName),
                                            };
                                            return {
                                              ...prev,
                                              [request.uid]: { ...current, customPracticeDrafts: drafts },
                                            };
                                          });
                                        }}
                                      />
                                      {similar.length > 0 ? (
                                        <div>
                                          <p className="mb-1 text-xs text-slate-600">Similar in chamber</p>
                                          <div className="flex flex-wrap gap-1">
                                            {similar.map(({ item, score }) => (
                                              <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => {
                                                  setApprovalFields((prev) => {
                                                    const current = prev[request.uid] || af;
                                                    const drafts = [...current.customPracticeDrafts];
                                                    drafts[draftIdx] = {
                                                      ...drafts[draftIdx],
                                                      mode: 'existing',
                                                      practiceId: item.id,
                                                      editedName: practiceDisplayName(item),
                                                    };
                                                    return {
                                                      ...prev,
                                                      [request.uid]: { ...current, customPracticeDrafts: drafts },
                                                    };
                                                  });
                                                }}
                                                className="rounded border border-teal-200 bg-teal-50 px-2 py-0.5 text-xs"
                                              >
                                                {practiceDisplayName(item)} ({Math.round(score * 100)}%)
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            <div className="grid gap-3 sm:grid-cols-2">
                              {!showCustomChamberPanel && !noChamberInfo && (
                                <Select
                                  label="Chamber"
                                  value={af.chamberId}
                                  onChange={(value) => void handleChamberChange(request.uid, value)}
                                  options={[
                                    { value: '', label: 'Select chamber' },
                                    ...chambers.map((c) => ({
                                      value: c.id,
                                      label: chamberDisplayName(c),
                                    })),
                                  ]}
                                />
                              )}
                              {noChamberInfo && (
                                <Input
                                  label="Chamber"
                                  value={NA_CHAMBER_NAME}
                                  disabled
                                />
                              )}
                              <Select
                                label="Primary Practice Area for lawyer"
                                value={af.practiceId}
                                disabled={
                                  (!af.chamberId && !showCustomChamberPanel && !noChamberInfo) || !!loadingP
                                }
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
                                      ? 'Loading Practice Areas…'
                                      : af.chamberId || noChamberInfo || showCustomChamberPanel
                                        ? 'Select Practice Area'
                                        : 'Select a chamber first',
                                  },
                                  ...practiceOpts.map((p) => ({
                                    value: p.id,
                                    label: practiceDisplayName(p),
                                  })),
                                  ...draftPracticeOptions,
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
                                label="Country of practice"
                                value={af.countryCode}
                                onChange={(value) =>
                                  setApprovalFields((prev) => ({
                                    ...prev,
                                    [request.uid]: {
                                      ...(prev[request.uid] || af),
                                      countryCode: value,
                                    },
                                  }))
                                }
                                options={COUNTRY_OPTIONS.map((c) => ({
                                  value: c.code,
                                  label: `${c.name} (${c.code})`,
                                }))}
                              />
                              <Select
                                label="Nationality"
                                value={af.nationality}
                                onChange={(value) =>
                                  setApprovalFields((prev) => ({
                                    ...prev,
                                    [request.uid]: { ...(prev[request.uid] || af), nationality: value },
                                  }))
                                }
                                options={COUNTRY_OPTIONS.map((c) => ({
                                  value: c.code,
                                  label: `${c.name} (${c.code})`,
                                }))}
                              />
                              <Select
                                label="Country / Region"
                                value={af.region}
                                onChange={(value) =>
                                  setApprovalFields((prev) => ({
                                    ...prev,
                                    [request.uid]: { ...(prev[request.uid] || af), region: value },
                                  }))
                                }
                                options={COUNTRY_OPTIONS.map((c) => ({
                                  value: c.code,
                                  label: `${c.name} (${c.code})`,
                                }))}
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
                                This chamber has no Practice Areas linked yet. Add Practice Areas under chamber settings before
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
