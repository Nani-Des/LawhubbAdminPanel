import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import DoctorLayout from '../../components/layout/DoctorLayout';
import { useAuth } from '../../contexts/AuthContext';
import { useChamber } from '../../contexts/ChamberContext';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { RefreshCw, BookOpen, MessagesSquare, AlertCircle, Lightbulb } from 'lucide-react';

const DoctorDashboardPage: React.FC = () => {
  const { currentDoctor } = useAuth();
  const { chamber, loading } = useChamber();
  const [incomingCount, setIncomingCount] = useState<number | null>(null);

  useEffect(() => {
    const id = chamber?.id || currentDoctor?.chamberId;
    if (!id) {
      setIncomingCount(null);
      return;
    }
    const ref = collection(db, 'Chamber', id, 'Referrals');
    const unsub = onSnapshot(
      ref,
      (snap) => setIncomingCount(snap.size),
      () => setIncomingCount(null)
    );
    return () => unsub();
  }, [chamber?.id, currentDoctor?.chamberId]);

  return (
    <DoctorLayout>
      <div className="max-w-4xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
          <p className="mt-1 text-slate-600">
            View referrals for your chamber, use the library, and chat or video call with clients — all in one place.
          </p>
        </div>

        {!currentDoctor?.chamberId && !loading && (
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <p className="text-sm">
              Your profile is not linked to a chamber yet. Ask your administrator to link your account so referrals
              show up here.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            to="/doctor/referrals"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300 hover:shadow-md"
          >
            <RefreshCw className="h-8 w-8 text-teal-600" />
            <p className="mt-3 font-semibold text-slate-900">Incoming referrals</p>
            <p className="mt-1 text-2xl font-bold text-teal-700">
              {incomingCount === null ? '—' : incomingCount}
            </p>
            <p className="mt-1 text-sm text-slate-500">For your chamber</p>
          </Link>
          <Link
            to="/doctor/library"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300 hover:shadow-md"
          >
            <BookOpen className="h-8 w-8 text-teal-600" />
            <p className="mt-3 font-semibold text-slate-900">Library</p>
            <p className="mt-1 text-sm text-slate-500">Browse, read, and upload books</p>
          </Link>
          <Link
            to="/doctor/chats"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300 hover:shadow-md"
          >
            <MessagesSquare className="h-8 w-8 text-teal-600" />
            <p className="mt-3 font-semibold text-slate-900">Messages & video</p>
            <p className="mt-1 text-sm text-slate-500">Message clients and start video calls</p>
          </Link>
          <Link
            to="/doctor/insights"
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300 hover:shadow-md"
          >
            <Lightbulb className="h-8 w-8 text-teal-600" />
            <p className="mt-3 font-semibold text-slate-900">Law insights</p>
            <p className="mt-1 text-sm text-slate-500">Create and browse legal content posts</p>
          </Link>
        </div>
      </div>
    </DoctorLayout>
  );
};

export default DoctorDashboardPage;
