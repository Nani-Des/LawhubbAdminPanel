import React, { useEffect, useState } from 'react';
import DoctorLayout from '../../components/layout/DoctorLayout';
import { useAuth } from '../../contexts/AuthContext';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { collection, doc, getDocs, serverTimestamp, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase';
import toast from 'react-hot-toast';

function generateSerial(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

interface ChamberOption {
  id: string;
  name: string;
}

const DoctorNewReferralPage: React.FC = () => {
  const { currentDoctor } = useAuth();
  const [chambers, setChambers] = useState<ChamberOption[]>([]);
  const [targetChamberId, setTargetChamberId] = useState('');
  const [patientReg, setPatientReg] = useState('');
  const [patientName, setPatientName] = useState('');
  const [sex, setSex] = useState('');
  const [dob, setDob] = useState('');
  const [age, setAge] = useState('');
  const [examFindings, setExamFindings] = useState('');
  const [treatment, setTreatment] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const snap = await getDocs(collection(db, 'Chamber'));
      if (cancelled) return;
      const opts = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: (data['Chamber Name'] || data.name || d.id) as string,
        };
      });
      opts.sort((a, b) => a.name.localeCompare(b.name));
      setChambers(opts);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedChamberName = chambers.find((c) => c.id === targetChamberId)?.name || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDoctor?.uid) {
      toast.error('Not signed in.');
      return;
    }
    if (!targetChamberId || !patientName.trim() || !reason.trim()) {
      toast.error('Choose a chamber, client name, and reason for referral.');
      return;
    }

    setSubmitting(true);
    const serial = generateSerial(7);
    try {
      let fileUrl = 'No file uploaded';
      if (file) {
        const ext = file.name.split('.').pop() || 'bin';
        const storageRef = ref(storage, `referral_files/${serial}.${ext}`);
        await uploadBytes(storageRef, file);
        fileUrl = await getDownloadURL(storageRef);
      }

      const referralRef = doc(db, 'Chamber', targetChamberId, 'Referrals', serial);
      await setDoc(referralRef, {
        'Serial Number': serial,
        'Patient Reg. No.': patientReg || 'N/A',
        Name: patientName.trim(),
        Sex: sex || 'N/A',
        'Date of Birth': dob || 'Not provided',
        Age: age || 'N/A',
        'Examination Findings': examFindings,
        'Treatment Administered': treatment,
        Diagnosis: diagnosis || 'N/A',
        'Reason for Referral': reason.trim(),
        'Uploaded Medical Records': fileUrl,
        'Selected Health Facility': selectedChamberName,
        Timestamp: serverTimestamp(),
        'Referred By': currentDoctor.uid,
      });

      toast.success('Referral sent.');
      setPatientReg('');
      setPatientName('');
      setSex('');
      setDob('');
      setAge('');
      setExamFindings('');
      setTreatment('');
      setDiagnosis('');
      setReason('');
      setFile(null);
    } catch (err) {
      console.error(err);
      toast.error('Could not send the referral. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DoctorLayout>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New referral</h1>
          <p className="text-slate-600">Send a referral to another chamber with the details below.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Receiving chamber *</label>
            <select
              required
              value={targetChamberId}
              onChange={(e) => setTargetChamberId(e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900"
            >
              <option value="">Select chamber…</option>
              {chambers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Client name *</label>
              <Input value={patientName} onChange={(e) => setPatientName(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Client reference no.</label>
              <Input value={patientReg} onChange={(e) => setPatientReg(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Sex</label>
              <select
                value={sex}
                onChange={(e) => setSex(e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5"
              >
                <option value="">—</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Date of birth</label>
              <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Age</label>
              <Input value={age} onChange={(e) => setAge(e.target.value)} placeholder="Optional if DOB set" />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Matter background</label>
            <textarea
              value={examFindings}
              onChange={(e) => setExamFindings(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Treatment administered</label>
            <textarea
              value={treatment}
              onChange={(e) => setTreatment(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Assessment</label>
            <Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Reason for referral *</label>
            <textarea
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-slate-300 px-3 py-2"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Attachment (PDF / image)</label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="text-sm text-slate-600"
            />
          </div>

          <Button type="submit" disabled={submitting} isLoading={submitting}>
            Send referral
          </Button>
        </form>
      </div>
    </DoctorLayout>
  );
};

export default DoctorNewReferralPage;
