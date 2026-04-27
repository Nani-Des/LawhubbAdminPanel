import React, { useCallback, useMemo, useState } from 'react';
import DoctorLayout from '../../components/layout/DoctorLayout';
import { useAuth } from '../../contexts/AuthContext';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  limit,
} from 'firebase/firestore';
import { fetchAndActivate, getRemoteConfig, getValue, isSupported } from 'firebase/remote-config';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { app, auth, db, storage } from '../../firebase';
import toast from 'react-hot-toast';
import { Lock, Unlock } from 'lucide-react';
import { formatProgressLabel, getBookProgress } from '../../lib/bookProgress';

declare global {
  interface Window {
    PaystackPop?: {
      setup: (opts: Record<string, unknown>) => { openIframe: () => void };
    };
  }
}

interface LibraryDoc {
  id: string;
  title?: string;
  author?: string;
  category?: string;
  description?: string;
  price?: number;
  url?: string;
  fileType?: string;
  timestamp?: { seconds: number };
  uploadedBy?: string;
  sellerId?: string;
}

const DoctorLibraryPage: React.FC = () => {
  const { currentDoctor } = useAuth();
  const [items, setItems] = useState<LibraryDoc[]>([]);
  const [purchases, setPurchases] = useState<
    { id: string; bookTitle?: string; amount?: number; buyerEmail?: string; createdAt?: string }[]
  >([]);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [payingBookId, setPayingBookId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: '', author: '', category: '', description: '', price: '0' });
  const [file, setFile] = useState<File | null>(null);
  const [purchasedBookIds, setPurchasedBookIds] = useState<Set<string>>(new Set());
  const [paystackPublicKey, setPaystackPublicKey] = useState('');

  React.useEffect(() => {
    const q = query(collection(db, 'library'), orderBy('timestamp', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as LibraryDoc)));
    });
    return () => unsub();
  }, []);

  React.useEffect(() => {
    if (!currentDoctor?.uid) return;
    const pq = query(
      collection(db, 'libraryPurchases'),
      where('sellerId', '==', currentDoctor.uid),
      limit(50)
    );
    const unsub = onSnapshot(
      pq,
      (snap) => {
        const list = snap.docs.map((d) => {
          const x = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            bookTitle: x.bookTitle as string | undefined,
            amount: x.amount as number | undefined,
            buyerEmail: x.buyerEmail as string | undefined,
            createdAt: x.createdAt ? String(x.createdAt) : undefined,
          };
        });
        list.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setPurchases(list);
      },
      () => setPurchases([])
    );
    return () => unsub();
  }, [currentDoctor?.uid]);

  React.useEffect(() => {
    if (!currentDoctor?.uid) {
      setPurchasedBookIds(new Set());
      return;
    }
    const pq = query(collection(db, 'libraryPurchases'), where('buyerId', '==', currentDoctor.uid), limit(200));
    const unsub = onSnapshot(
      pq,
      (snap) => {
        const ids = new Set<string>();
        snap.docs.forEach((d) => {
          const x = d.data() as Record<string, unknown>;
          if (x.status === 'success' && typeof x.bookId === 'string') ids.add(x.bookId);
        });
        setPurchasedBookIds(ids);
      },
      () => setPurchasedBookIds(new Set())
    );
    return () => unsub();
  }, [currentDoctor?.uid]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!(await isSupported())) return;
        const rc = getRemoteConfig(app);
        rc.settings = { minimumFetchIntervalMillis: 60_000 };
        rc.defaultConfig = { paystack_public_key: '' };
        await fetchAndActivate(rc);
        const remoteKey = getValue(rc, 'paystack_public_key').asString().trim();
        if (mounted) setPaystackPublicKey(remoteKey);
      } catch (err) {
        console.error('Remote Config key load failed:', err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const filtered = items.filter((p) => {
    const q = search.toLowerCase();
    return (
      (p.title || '').toLowerCase().includes(q) ||
      (p.author || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q)
    );
  });

  const myUploads = items.filter((p) => p.uploadedBy === currentDoctor?.uid);

  const canAccessBook = useCallback(
    (b: LibraryDoc) => {
      const price = Number(b.price || 0);
      const ownerId = b.uploadedBy || b.sellerId;
      return price <= 0 || ownerId === currentDoctor?.uid || purchasedBookIds.has(b.id);
    },
    [currentDoctor?.uid, purchasedBookIds]
  );

  const recordPurchase = async (b: LibraryDoc, reference: string) => {
    if (!currentDoctor?.uid) return;
    await addDoc(collection(db, 'libraryPurchases'), {
      bookId: b.id,
      bookTitle: b.title || '',
      amount: Number(b.price || 0),
      buyerId: currentDoctor.uid,
      buyerEmail: `${currentDoctor.uid}@lawhubb.local`,
      sellerId: b.uploadedBy || '',
      paystackReference: reference,
      provider: 'paystack',
      status: 'success',
      isPaid: true,
      paymentStatus: 'paid',
      createdAt: serverTimestamp(),
      payoutNumber: '+233558466487',
    });
  };

  const deleteBook = async (b: LibraryDoc) => {
    if (!currentDoctor?.uid) return;
    const ownerId = b.uploadedBy || b.sellerId;
    if (ownerId !== currentDoctor.uid) {
      toast.error('You can only delete books you uploaded.');
      return;
    }
    if (!window.confirm(`Delete "${b.title || 'this book'}"?`)) return;

    try {
      if (b.url) {
        await deleteObject(ref(storage, b.url));
      }
    } catch (err) {
      console.warn('Storage delete failed; continuing with firestore delete', err);
    }

    try {
      await deleteDoc(doc(db, 'library', b.id));
      toast.success('Book deleted.');
    } catch (err) {
      console.error(err);
      toast.error('Could not delete this book.');
    }
  };

  const beginPaystackPayment = (b: LibraryDoc) => {
    if (!paystackPublicKey) {
      toast.error('Paystack key missing in Remote Config (paystack_public_key).');
      return;
    }
    if (!window.PaystackPop?.setup) {
      toast.error('Paystack is still loading. Try again in a moment.');
      return;
    }
    if (!currentDoctor?.uid) {
      toast.error('Please sign in again.');
      return;
    }
    const amount = Number(b.price || 0);
    if (!(amount > 0)) {
      openReader(b);
      return;
    }
    setPayingBookId(b.id);
    const buyerEmail = auth.currentUser?.email?.trim() || '';
    if (!buyerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
      setPayingBookId(null);
      toast.error('Your account needs a valid email before payment can continue.');
      return;
    }
    const handleSuccess = (response: { reference?: string }) => {
      void (async () => {
        try {
          await recordPurchase(b, response?.reference || '');
          setPurchasedBookIds((prev) => new Set(prev).add(b.id));
          toast.success('Payment successful. You can now read this book.');
          void openReader(b);
        } catch (err) {
          console.error(err);
          toast.error('Payment succeeded but purchase record failed.');
        } finally {
          setPayingBookId(null);
        }
      })();
    };
    const handleClose = () => {
      setPayingBookId(null);
      toast('Payment cancelled.');
    };
    const handler = window.PaystackPop.setup({
      key: paystackPublicKey,
      email: buyerEmail,
      amount: Math.round(amount * 100),
      currency: 'GHS',
      channels: ['mobile_money'],
      metadata: {
        custom_fields: [
          { display_name: 'Book title', variable_name: 'book_title', value: b.title || '' },
          { display_name: 'Receiver', variable_name: 'receiver', value: '+233558466487' },
        ],
      },
      callback: handleSuccess,
      onClose: handleClose,
    });
    handler.openIframe();
  };

  const openReader = (b: LibraryDoc) => {
    if (!b.url) {
      toast.error('This book has no file attached.');
      return;
    }
    if (!canAccessBook(b)) {
      beginPaystackPayment(b);
      return;
    }
    window.open(b.url, '_blank', 'noopener,noreferrer');
  };

  const lockedCount = useMemo(
    () => filtered.filter((b) => !canAccessBook(b) && Number(b.price || 0) > 0).length,
    [filtered, canAccessBook]
  );

  const progressFor = (bookId: string): string => {
    if (!currentDoctor?.uid) return '';
    return formatProgressLabel(getBookProgress(currentDoctor.uid, bookId));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDoctor?.uid || !file || !form.title.trim()) {
      toast.error('Choose a file and title.');
      return;
    }
    const numericPrice = Number(form.price || '0');
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      toast.error('Price must be 0 or more.');
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!['pdf', 'doc', 'docx'].includes(ext)) {
      toast.error('Use PDF, DOC, or DOCX.');
      return;
    }
    setUploading(true);
    try {
      const safeTitle = form.title.replace(/\s+/g, '_');
      const path = `library_files/${Date.now()}_${safeTitle}.${ext}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await addDoc(collection(db, 'library'), {
        title: form.title.trim(),
        author: form.author.trim(),
        category: form.category.trim(),
        description: form.description.trim(),
        price: numericPrice,
        url,
        fileType: ext,
        timestamp: serverTimestamp(),
        uploadedBy: currentDoctor.uid,
        sellerId: currentDoctor.uid,
      });
      toast.success('Book uploaded.');
      setForm({ title: '', author: '', category: '', description: '', price: '0' });
      setFile(null);
    } catch (err) {
      console.error(err);
      toast.error('Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <DoctorLayout>
      <div className="mx-auto max-w-5xl space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Library</h1>
          <p className="text-slate-600">Browse shared books, open what you need, and add new titles for others to read.</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Upload a book</h2>
          <p className="mt-1 text-sm text-slate-500">Your uploads appear in “Your uploads” below.</p>
          <form onSubmit={handleUpload} className="mt-4 grid gap-3 sm:grid-cols-2">
            <Input
              placeholder="Title *"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
            <Input
              placeholder="Author"
              value={form.author}
              onChange={(e) => setForm((f) => ({ ...f, author: e.target.value }))}
            />
            <Input
              placeholder="Law category (e.g., Criminal Law, Civil Law, Corporate Law)"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            />
            <div>

              <Input
                placeholder="Enter amount to charge (use 0 for free)"
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
                            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                Book price (GHS)
              </label>
            </div>
            <div className="sm:col-span-2">
              <textarea
                placeholder="Description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
              />
            </div>
            <div className="sm:col-span-2">
              <input type="file" accept=".pdf,.doc,.docx" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </div>
            <Button type="submit" disabled={uploading} isLoading={uploading}>
              Upload
            </Button>
          </form>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-900">Your uploads</h2>
          {myUploads.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">You have not uploaded any books from here yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {myUploads.map((b) => {
                const prog = progressFor(b.id);
                return (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    {b.url ? (
                      <button
                        type="button"
                        onClick={() => openReader(b)}
                        className="text-left font-medium text-slate-900 hover:text-teal-700 hover:underline"
                      >
                        {b.title}
                      </button>
                    ) : (
                      <span className="font-medium text-slate-900">{b.title}</span>
                    )}
                    {prog ? <p className="mt-0.5 text-xs text-slate-500">{prog}</p> : null}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500">₵{(b.price ?? 0).toFixed(2)}</span>
                    <button
                      type="button"
                      onClick={() => void deleteBook(b)}
                      className="rounded-md border border-rose-200 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
              })}
            </ul>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-900">Sales of your books</h2>
          <p className="mt-1 text-sm text-slate-500">When purchases are recorded for books you published, they show here.</p>
          {purchases.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No sales to show yet.</p>
          ) : (
            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2">Book</th>
                    <th className="px-3 py-2">Buyer</th>
                    <th className="px-3 py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{p.bookTitle || '—'}</td>
                      <td className="px-3 py-2">{p.buyerEmail || '—'}</td>
                      <td className="px-3 py-2">{p.amount != null ? `₵${p.amount}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-slate-900">All books</h2>
            <Input
              placeholder="Search title, author, category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs bg-white"
            />
          </div>
          <p className="mt-2 text-sm text-slate-500">
            Tap a title to open in a new browser tab. Free books open immediately; paid books require Paystack payment
            first. {lockedCount} locked book(s).
          </p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Author</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Access</th>
                  <th className="px-3 py-2">Progress</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b) => (
                  <tr key={b.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      {b.url ? (
                        <button
                          type="button"
                          onClick={() => openReader(b)}
                          className="text-left font-medium text-teal-800 hover:text-teal-600 hover:underline"
                        >
                          {b.title}
                        </button>
                      ) : (
                        <span className="font-medium text-slate-900">{b.title}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{b.author || '—'}</td>
                    <td className="px-3 py-2 text-slate-600">{b.category || '—'}</td>
                    <td className="px-3 py-2">₵{(b.price ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2">
                      {canAccessBook(b) ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                          <Unlock className="h-3.5 w-3.5" />
                          Open
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={payingBookId === b.id}
                          onClick={() => beginPaystackPayment(b)}
                          className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-700 hover:bg-amber-100 disabled:opacity-60"
                        >
                          <Lock className="h-3.5 w-3.5" />
                          {payingBookId === b.id ? 'Paying...' : 'Pay to unlock'}
                        </button>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{progressFor(b.id) || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

    </DoctorLayout>
  );
};

export default DoctorLibraryPage;
