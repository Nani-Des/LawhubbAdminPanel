import React, { useEffect, useRef, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { Send, Mic2 } from 'lucide-react';

export interface ChatMessage {
  id: string;
  content?: string;
  audioUrl?: string;
  senderId?: string;
  recipientId?: string;
  timestamp?: { seconds: number; nanoseconds?: number };
  read?: boolean;
  type?: string;
}

interface LawyerChatPanelProps {
  chatId: string;
  recipientId: string;
  recipientName: string;
  doctorUid: string;
}

function formatTime(ts: ChatMessage['timestamp']): string {
  if (!ts?.seconds) return '';
  const d = new Date(ts.seconds * 1000);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const LawyerChatPanel: React.FC<LawyerChatPanelProps> = ({
  chatId,
  recipientId,
  recipientName,
  doctorUid,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const markedIds = useRef(new Set<string>());

  useEffect(() => {
    const q = query(collection(db, 'Chats', chatId, 'Messages'), orderBy('timestamp', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as ChatMessage))
      );
    });
    return () => unsub();
  }, [chatId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    const toMark = messages.filter(
      (m) => m.recipientId === doctorUid && m.read === false && !markedIds.current.has(m.id)
    );
    if (!toMark.length) return;
    toMark.forEach((m) => markedIds.current.add(m.id));
    const batch = writeBatch(db);
    toMark.forEach((m) => {
      batch.update(doc(db, 'Chats', chatId, 'Messages', m.id), { read: true });
    });
    batch.commit().catch(() => {
      toMark.forEach((m) => markedIds.current.delete(m.id));
    });
  }, [messages, chatId, doctorUid]);

  const sendText = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await addDoc(collection(db, 'Chats', chatId, 'Messages'), {
        content: text,
        senderId: doctorUid,
        recipientId,
        timestamp: serverTimestamp(),
        read: false,
        type: 'text',
      });
      await updateDoc(doc(db, 'Chats', chatId), {
        lastMessage: text,
        timestamp: serverTimestamp(),
      });
      setDraft('');
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col min-h-0 rounded-2xl border border-slate-200/80 bg-slate-50 overflow-hidden shadow-inner">
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-sm text-slate-500 py-12">No messages yet. Send a message to get started.</p>
        )}
        {messages.map((m) => {
          const mine = m.senderId === doctorUid;
          const type = m.type || 'text';
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 shadow-sm ${
                  mine
                    ? 'bg-gradient-to-br from-teal-600 to-teal-700 text-white rounded-br-md'
                    : 'bg-white text-slate-800 border border-slate-200 rounded-bl-md'
                }`}
              >
                {type === 'audio' && m.audioUrl ? (
                  <div className="flex items-center gap-2 min-w-[200px]">
                    <Mic2 className={`h-4 w-4 shrink-0 ${mine ? 'text-teal-100' : 'text-teal-600'}`} />
                    <audio controls src={m.audioUrl} className="h-8 w-full max-w-[220px]" />
                  </div>
                ) : (
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                    {m.content || (type === 'audio' ? 'Voice message' : '')}
                  </p>
                )}
                <div
                  className={`mt-1.5 flex items-center gap-1.5 text-[11px] ${
                    mine ? 'text-teal-100/90 justify-end' : 'text-slate-500'
                  }`}
                >
                  <span>{formatTime(m.timestamp)}</span>
                  {mine && (
                    <span aria-hidden title={m.read ? 'Read' : 'Sent'}>
                      {m.read ? '✓✓' : '✓'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-200 bg-white p-3">
        <p className="text-[11px] text-slate-400 mb-2 px-1">To: {recipientName}</p>
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void sendText();
              }
            }}
            placeholder="Write a message…"
            rows={2}
            className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
            aria-label="Message text"
          />
          <button
            type="button"
            onClick={() => void sendText()}
            disabled={sending || !draft.trim()}
            className="shrink-0 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-white shadow-md transition hover:bg-teal-700 disabled:opacity-40 disabled:pointer-events-none"
            aria-label="Send message"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
        <p className="mt-2 text-center text-[11px] text-slate-400">Enter to send · Shift+Enter for a new line</p>
      </div>
    </div>
  );
};

export default LawyerChatPanel;
