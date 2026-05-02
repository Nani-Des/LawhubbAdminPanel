import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Timestamp, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';
import toast from 'react-hot-toast';
import { db, storage } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import {
  createManagedAuthUser,
  signInExistingUserForProvisioning,
  type ProvisionedAuthUser,
} from '../utils/managedAuthProvisioning';

type SignupMode = 'new' | 'existing';

const LawyerSignupPage: React.FC = () => {
  const navigate = useNavigate();
  const [signupMode, setSignupMode] = useState<SignupMode>('new');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    fname: '',
    lname: '',
    email: '',
    mobile: '',
    password: '',
    confirmPassword: '',
  });
  const [practiceLicenceFile, setPracticeLicenceFile] = useState<File | null>(null);
  const [barEnrolmentFile, setBarEnrolmentFile] = useState<File | null>(null);
  const [gbaMembershipFile, setGbaMembershipFile] = useState<File | null>(null);

  const fullName = useMemo(
    () => `${form.fname.trim()} ${form.lname.trim()}`.trim() || 'Lawyer Applicant',
    [form.fname, form.lname]
  );

  const uploadDocument = async (uid: string, key: string, file: File) => {
    const safeName = file.name.replace(/\s+/g, '_');
    const filePath = `lawyer_verification/${uid}/${key}_${Date.now()}_${safeName}`;
    const fileRef = ref(storage, filePath);
    await uploadBytes(fileRef, file);
    const url = await getDownloadURL(fileRef);
    return { url, path: filePath, name: file.name };
  };

  const persistLawyerApplication = async (uid: string, opts?: { setCreatedAt?: boolean }) => {
    const practiceLicence = await uploadDocument(uid, 'practice_licence', practiceLicenceFile!);
    const barEnrolment = await uploadDocument(uid, 'bar_enrolment', barEnrolmentFile!);
    const gbaMembership = gbaMembershipFile
      ? await uploadDocument(uid, 'gba_membership', gbaMembershipFile)
      : null;

    await setDoc(
      doc(db, 'Users', uid),
      {
        'User ID': uid,
        Fname: form.fname.trim(),
        Lname: form.lname.trim(),
        Email: form.email.trim(),
        'Mobile Number': form.mobile.trim(),
        Title: '',
        Designation: 'Applicant',
        'Practice ID': '',
        'Chamber ID': '',
        Region: '',
        'User Pic': '',
        Role: false,
        Status: true,
        lawyerVerificationStatus: 'pending',
        lawyerVerificationRequestedAt: serverTimestamp(),
        ...(opts?.setCreatedAt ? { CreatedAt: Timestamp.fromDate(new Date()) } : {}),
      },
      { merge: true }
    );

    await setDoc(doc(db, 'LawyerVerificationRequests', uid), {
      uid,
      email: form.email.trim(),
      firstName: form.fname.trim(),
      lastName: form.lname.trim(),
      fullName,
      mobile: form.mobile.trim(),
      status: 'pending',
      requestedRole: 'lawyer',
      documents: {
        practiceLicence,
        barEnrolment,
        gbaMembership,
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!practiceLicenceFile) {
      toast.error('Practising licence (GLC certificate) is required.');
      return;
    }
    if (!barEnrolmentFile) {
      toast.error('Proof of enrolment / call to the Bar is required.');
      return;
    }

    if (signupMode === 'new') {
      const normalizedPassword = form.password.trim();
      if (!/^[A-Za-z0-9]{6,}$/.test(normalizedPassword)) {
        toast.error('Password must be at least 6 characters and contain only letters and numbers.');
        return;
      }
      if (normalizedPassword !== form.confirmPassword.trim()) {
        toast.error('Passwords do not match.');
        return;
      }
    } else {
      if (!form.password.trim()) {
        toast.error('Enter your account password.');
        return;
      }
    }

    setIsSubmitting(true);
    let createdAuthUser: ProvisionedAuthUser | null = null;

    try {
      let uid: string;

      if (signupMode === 'new') {
        const normalizedPassword = form.password.trim();
        const managed = await createManagedAuthUser(form.email.trim(), normalizedPassword, fullName);
        createdAuthUser = managed;
        uid = managed.user.uid;

        await persistLawyerApplication(uid, { setCreatedAt: true });
      } else {
        const managed = await signInExistingUserForProvisioning(form.email.trim(), form.password);
        createdAuthUser = managed;
        uid = managed.user.uid;

        const reqSnap = await getDoc(doc(db, 'LawyerVerificationRequests', uid));
        const existingReq = reqSnap.data();
        if (existingReq?.status === 'pending') {
          toast.error('You already have a lawyer verification application pending.');
          return;
        }

        const userSnap = await getDoc(doc(db, 'Users', uid));
        const userData = userSnap.data();
        if (userData?.lawyerVerificationStatus === 'pending') {
          toast.error('You already have a lawyer verification application pending.');
          return;
        }
        if (userData?.lawyerVerificationStatus === 'approved' && userData?.Role) {
          toast.error('This account is already verified as a lawyer.');
          return;
        }

        await persistLawyerApplication(uid, { setCreatedAt: !userSnap.exists() });
      }

      toast.success('Application submitted. A super admin will verify your documents.');
      navigate('/login');
    } catch (err: any) {
      console.error('Failed to submit lawyer signup request:', err);
      const code = err?.code as string | undefined;
      if (code === 'auth/email-already-in-use') {
        toast.error('This email already has an account. Choose “Use my existing account” below and sign in.');
      } else if (
        code === 'auth/user-not-found' ||
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials'
      ) {
        toast.error('Incorrect email or password.');
      } else {
        toast.error('Could not submit application. Please try again.');
      }

      if (createdAuthUser && signupMode === 'new') {
        try {
          await deleteUser(createdAuthUser.user);
        } catch (cleanupErr) {
          console.error('Failed to clean up auth user after signup failure:', cleanupErr);
        }
      }
    } finally {
      if (createdAuthUser) {
        await createdAuthUser.release();
      }
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-slate-900">Lawyer Registration</h1>
        <p className="mt-2 text-sm text-slate-600">
          Submit documents for super-admin verification. Create a new login or use an account you already have on LawHubb.
        </p>

        <div className="mt-5 flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => setSignupMode('new')}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              signupMode === 'new'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Create new account
          </button>
          <button
            type="button"
            onClick={() => setSignupMode('existing')}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              signupMode === 'existing'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Use my existing account
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="First Name"
              value={form.fname}
              onChange={(e) => setForm((prev) => ({ ...prev, fname: e.target.value }))}
              required
            />
            <Input
              label="Last Name"
              value={form.lname}
              onChange={(e) => setForm((prev) => ({ ...prev, lname: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
              required
            />
            <Input
              label="Mobile Number"
              value={form.mobile}
              onChange={(e) => setForm((prev) => ({ ...prev, mobile: e.target.value }))}
              required
            />
          </div>

          {signupMode === 'new' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                helperText="Use letters and numbers only, minimum 6 characters."
                required
              />
              <Input
                label="Confirm Password"
                type="password"
                value={form.confirmPassword}
                onChange={(e) => setForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                required
              />
            </div>
          ) : (
            <div>
              <Input
                label="Password"
                type="password"
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                helperText="Sign in with the password for this email so we can attach the application to your account."
                required
              />
            </div>
          )}

          <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-800">
                Practising licence (GLC certificate) <span className="text-red-600">*</span>
              </label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setPracticeLicenceFile(e.target.files?.[0] || null)}
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-800">
                Proof of enrolment / call to the Bar <span className="text-red-600">*</span>
              </label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setBarEnrolmentFile(e.target.files?.[0] || null)}
                required
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-800">
                GBA membership or ID <span className="text-slate-500">(optional)</span>
              </label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                onChange={(e) => setGbaMembershipFile(e.target.files?.[0] || null)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              />
            </div>
          </div>

          <Button type="submit" fullWidth isLoading={isSubmitting}>
            Submit for verification
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-teal-700 hover:text-teal-800">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LawyerSignupPage;
