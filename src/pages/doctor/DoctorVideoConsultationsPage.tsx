import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DoctorLayout from '../../components/layout/DoctorLayout';
import { useAuth } from '../../contexts/AuthContext';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import LiveConsultationAgora from '../../components/doctor/LiveConsultationAgora';
import LawyerChatPanel from '../../components/doctor/LawyerChatPanel';
import { getOrCreateChatThread } from '../../lib/chatThread';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import toast from 'react-hot-toast';
import { Search, Video, MessageCircle, ChevronLeft, Users } from 'lucide-react';

interface PatientRow {
  id: string;
  Fname?: string;
  Lname?: string;
  Email?: string;
  'User Pic'?: string;
}

interface ChatRow {
  chatId: string;
  otherId: string;
  otherName: string;
  otherPic?: string;
  lastMessage?: string;
  lastSeconds?: number;
}

function fullName(u: Pick<PatientRow, 'Fname' | 'Lname'>): string {
  return `${u.Fname || ''} ${u.Lname || ''}`.trim() || 'Unnamed user';
}

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

const ConsultationBadge: React.FC<{ chatId: string }> = ({ chatId }) => {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'Consultations', chatId), (snap) => {
      const d = snap.data() as { status?: string } | undefined;
      setActive(d?.status === 'active');
    });
    return () => unsub();
  }, [chatId]);
  if (!active) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-500/30"
      title="Video call in progress"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
      Live
    </span>
  );
};

const DoctorVideoConsultationsPage: React.FC = () => {
  const { currentDoctor } = useAuth();
  const doctorUid = currentDoctor?.uid;

  const [chats, setChats] = useState<ChatRow[]>([]);
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [nameQuery, setNameQuery] = useState('');
  const [liveSession, setLiveSession] = useState<{ chatId: string; patientName: string } | null>(null);
  const [selected, setSelected] = useState<ChatRow | null>(null);
  const [recipientOnline, setRecipientOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if (!doctorUid) return;
    const q = query(collection(db, 'Chats'), where('participants', 'array-contains', doctorUid));
    const unsub = onSnapshot(q, async (snap) => {
      const rows: ChatRow[] = [];
      for (const d of snap.docs) {
        const data = d.data();
        const parts = data.participants as string[] | undefined;
        if (!parts?.length) continue;
        const otherId = parts.find((id) => id !== doctorUid);
        if (!otherId) continue;
        const u = await getDoc(doc(db, 'Users', otherId));
        const ud = u.data() as PatientRow | undefined;
        const ts = data.timestamp as { seconds?: number } | undefined;
        rows.push({
          chatId: d.id,
          otherId,
          otherName: u.exists() ? fullName(ud || {}) : 'Unknown',
          otherPic: ud?.['User Pic'] as string | undefined,
          lastMessage: (data.lastMessage as string) || undefined,
          lastSeconds: ts?.seconds,
        });
      }
      rows.sort((a, b) => (b.lastSeconds ?? 0) - (a.lastSeconds ?? 0));
      setChats(rows);
    });
    return () => unsub();
  }, [doctorUid]);

  useEffect(() => {
    if (!selected?.otherId) {
      setRecipientOnline(null);
      return;
    }
    const unsub = onSnapshot(doc(db, 'Users', selected.otherId), (snap) => {
      if (!snap.exists()) {
        setRecipientOnline(null);
        return;
      }
      const d = snap.data() as { isOnline?: boolean };
      setRecipientOnline(!!d.isOnline);
    });
    return () => unsub();
  }, [selected?.otherId]);

  const chattedUserIds = useMemo(() => new Set(chats.map((c) => c.otherId)), [chats]);
  const visibleChats = useMemo(
    () => chats.filter((row) => !!row.lastMessage && row.lastMessage.trim().length > 0),
    [chats]
  );

  const loadPatients = useCallback(async () => {
    if (!doctorUid) return;
    setPatientsLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'Users'), where('Role', '==', false), limit(300)));
      const list: PatientRow[] = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as object) } as PatientRow))
        .filter((p) => p.id !== doctorUid);
      setPatients(list);
      if (list.length === 0) {
        toast('No clients found. Try again later or contact support.');
      }
    } catch (e) {
      console.error(e);
      toast.error('Could not load client list.');
    } finally {
      setPatientsLoading(false);
    }
  }, [doctorUid]);

  const filteredPatients = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    if (q.length < 1) return [];
    return patients.filter((p) => {
      if (chattedUserIds.has(p.id)) return false;
      const name = fullName(p).toLowerCase();
      const em = (p.Email || '').toLowerCase();
      return name.includes(q) || em.includes(q);
    });
  }, [patients, nameQuery, chattedUserIds]);

  const openOrCreateChat = async (patientId: string, patientName: string, pic?: string) => {
    if (!doctorUid) return;
    try {
      const chatId = await getOrCreateChatThread(doctorUid, patientId);
      setSelected({
        chatId,
        otherId: patientId,
        otherName: patientName,
        otherPic: pic,
      });
    } catch (e) {
      console.error(e);
      toast.error('Could not open this conversation.');
    }
  };

  const startLiveConsultation = async (patientId: string, patientName: string) => {
    if (!doctorUid) return;
    try {
      const chatId = await getOrCreateChatThread(doctorUid, patientId);
      await setDoc(doc(db, 'Consultations', chatId), {
        chatId,
        initiatorId: doctorUid,
        recipientId: patientId,
        status: 'active',
        timestamp: serverTimestamp(),
      });
      setLiveSession({ chatId, patientName });
      toast.success('Video call started. They can join from their messages.');
    } catch (e) {
      console.error(e);
      toast.error('Could not start the video call.');
    }
  };

  const joinLiveIfActive = async (row: ChatRow) => {
    try {
      const snap = await getDoc(doc(db, 'Consultations', row.chatId));
      if (snap.data()?.status !== 'active') {
        toast.error('No active video call here yet. Tap Start video first.');
        return;
      }
      setLiveSession({ chatId: row.chatId, patientName: row.otherName });
    } catch (e) {
      console.error(e);
      toast.error('Could not join the call. Try starting the video again.');
    }
  };

  const formatListTime = (sec?: number) => {
    if (!sec) return '';
    const d = new Date(sec * 1000);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return sameDay
      ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <DoctorLayout>
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Messages & video calls</h1>
          <p className="mt-2 max-w-xl text-slate-600">
            Chat with clients and start a video call when you need to speak face to face.
          </p>
        </div>

        <div className="flex min-h-[min(720px,calc(100vh-12rem))] flex-col overflow-hidden rounded-3xl border border-slate-200/90 bg-white shadow-xl shadow-slate-200/50 ring-1 ring-slate-100 lg:flex-row">
          {/* Conversation list */}
          <aside
            className={`flex w-full flex-col border-b border-slate-200 lg:w-[380px] lg:shrink-0 lg:border-b-0 lg:border-r ${
              selected ? 'hidden lg:flex' : 'flex'
            }`}
          >
            <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white p-4">
              <div className="flex items-center gap-2 text-slate-800">
                <MessageCircle className="h-5 w-5 text-teal-600" />
                <span className="font-semibold">Conversations</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {visibleChats.length} conversation{visibleChats.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="max-h-[42vh] flex-1 overflow-y-auto lg:max-h-none">
              {!doctorUid ? null : visibleChats.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
                  <Users className="h-10 w-10 text-slate-300" />
                  <p className="text-sm font-medium text-slate-700">No chats yet</p>
                  <p className="text-xs text-slate-500">Use search below to start a new conversation.</p>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {visibleChats.map((row) => {
                    const activeSel = selected?.chatId === row.chatId;
                    return (
                      <li key={row.chatId}>
                        <button
                          type="button"
                          onClick={() => setSelected(row)}
                          className={`flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${
                            activeSel ? 'bg-teal-50/80 ring-inset ring-1 ring-teal-100' : ''
                          }`}
                        >
                          <div className="relative shrink-0">
                            {row.otherPic ? (
                              <img
                                src={row.otherPic}
                                alt=""
                                className="h-12 w-12 rounded-2xl object-cover ring-2 ring-white shadow"
                              />
                            ) : (
                              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-200 to-slate-300 text-sm font-bold text-slate-700 shadow-inner">
                                {initials(row.otherName)}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate font-semibold text-slate-900">{row.otherName}</span>
                              <span className="shrink-0 text-[11px] text-slate-400">
                                {formatListTime(row.lastSeconds)}
                              </span>
                            </div>
                            <p className="mt-0.5 truncate text-sm text-slate-500">
                              {row.lastMessage || 'No messages yet'}
                            </p>
                            <div className="mt-1.5">
                              <ConsultationBadge chatId={row.chatId} />
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="border-t border-slate-100 bg-slate-50/80 p-4">
              <div className="flex items-center gap-2 text-slate-800">
                <Search className="h-4 w-4 text-teal-600" />
                <span className="text-sm font-semibold">New message</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">Search to find contacts you have not chatted with yet.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button type="button" size="sm" onClick={loadPatients} isLoading={patientsLoading} disabled={!doctorUid}>
                  Load people
                </Button>
                <Input
                  placeholder="Search name or email…"
                  value={nameQuery}
                  onChange={(e) => setNameQuery(e.target.value)}
                  className="flex-1 bg-white text-sm"
                />
              </div>
              <ul className="mt-3 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white">
                {filteredPatients.length === 0 ? (
                  <li className="px-3 py-6 text-center text-xs text-slate-500">
                    {nameQuery.trim().length === 0 ? 'Type a name or email to search contacts' : 'No matches'}
                  </li>
                ) : (
                  filteredPatients.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => void openOrCreateChat(p.id, fullName(p), p['User Pic'])}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-teal-50/50"
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-600">
                          {initials(fullName(p))}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{fullName(p)}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </aside>

          {/* Chat + video toolbar */}
          <main
            className={`flex min-h-0 flex-1 flex-col bg-gradient-to-b from-white to-slate-50/50 ${
              !selected ? 'hidden lg:flex' : 'flex'
            }`}
          >
            {!selected ? (
              <div className="m-auto max-w-sm px-6 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-teal-100 text-teal-700">
                  <MessageCircle className="h-8 w-8" />
                </div>
                <p className="text-lg font-semibold text-slate-800">Pick a conversation</p>
                <p className="mt-2 text-sm text-slate-500">
                  Select someone on the left, or find a person under New message to start chatting.
                </p>
              </div>
            ) : (
              <>
                <header className="flex shrink-0 items-center gap-3 border-b border-slate-200/80 bg-white/90 px-3 py-3 backdrop-blur sm:px-5">
                  <button
                    type="button"
                    className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
                    onClick={() => setSelected(null)}
                    aria-label="Back to list"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  {selected.otherPic ? (
                    <img src={selected.otherPic} alt="" className="h-11 w-11 rounded-2xl object-cover ring-2 ring-slate-100" />
                  ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-200 text-sm font-bold text-slate-700">
                      {initials(selected.otherName)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-semibold text-slate-900">{selected.otherName}</h2>
                    <p className="text-xs text-slate-500">
                      {recipientOnline === true ? (
                        <span className="text-emerald-600">Online</span>
                      ) : recipientOnline === false ? (
                        'Offline'
                      ) : (
                        '…'
                      )}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="!h-9"
                      onClick={() => void startLiveConsultation(selected.otherId, selected.otherName)}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Video className="h-4 w-4 text-teal-600" />
                        Start video
                      </span>
                    </Button>
                    <Button type="button" size="sm" className="!h-9" onClick={() => void joinLiveIfActive(selected)}>
                      Join video
                    </Button>
                  </div>
                </header>

                <div className="min-h-0 flex-1 p-3 sm:p-4">
                  {doctorUid && (
                    <LawyerChatPanel
                      chatId={selected.chatId}
                      recipientId={selected.otherId}
                      recipientName={selected.otherName}
                      doctorUid={doctorUid}
                    />
                  )}
                </div>
              </>
            )}
          </main>
        </div>
      </div>

      {liveSession && (
        <LiveConsultationAgora
          chatId={liveSession.chatId}
          patientName={liveSession.patientName}
          onClose={() => setLiveSession(null)}
        />
      )}
    </DoctorLayout>
  );
};

export default DoctorVideoConsultationsPage;
