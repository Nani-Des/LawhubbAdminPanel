import React, { useCallback, useState } from 'react';
import DoctorLayout from '../../components/layout/DoctorLayout';
import { useAuth } from '../../contexts/AuthContext';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import LibraryBookReader from '../../components/doctor/LibraryBookReader';
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  limit,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase';
import toast from 'react-hot-toast';
import { ExternalLink } from 'lucide-react';
import { formatProgressLabel, getBookProgress } from '../../lib/bookProgress';

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
}

const DoctorLibraryPage: React.FC = () => {
  const { currentDoctor } = useAuth();
  const [items, setItems] = useState<LibraryDoc[]>([]);
  const [purchases, setPurchases] = useState<
    { id: string; bookTitle?: string; amount?: number; buyerEmail?: string; createdAt?: string }[]
  >([]);
  const [search, setSearch] = useState('');
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ title: '', author: '', category: '', description: '', price: '0' });
  const [file, setFile] = useState<File | null>(null);
  const [readerBook, setReaderBook] = useState<LibraryDoc | null>(null);
  const [progressTick, setProgressTick] = useState(0);

  const bumpProgress = useCallback(() => setProgressTick((t) => t + 1), []);

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

  const filtered = items.filter((p) => {
    const q = search.toLowerCase();
    return (
      (p.title || '').toLowerCase().includes(q) ||
      (p.author || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q)
    );
  });

  const myUploads = items.filter((p) => p.uploadedBy === currentDoctor?.uid);

  const openReader = (b: LibraryDoc) => {
    if (!b.url) {
      toast.error('This book has no file attached.');
      return;
    }
    setReaderBook(b);
  };

  const progressFor = (bookId: string): string => {
    void progressTick;
    if (!currentDoctor?.uid) return '';
    return formatProgressLabel(getBookProgress(currentDoctor.uid, bookId));
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDoctor?.uid || !file || !form.title.trim()) {
      toast.error('Choose a file and title.');
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
        price: parseFloat(form.price) || 0,
        url,
        fileType: ext,
        timestamp: serverTimestamp(),
        uploadedBy: currentDoctor.uid,
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
              placeholder="Category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            />
            <Input
              placeholder="Price"
              type="number"
              step="0.01"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            />
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
                  <span className="text-slate-500">₵{(b.price ?? 0).toFixed(2)}</span>
                  {b.url && (
                    <a
                      href={b.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-teal-700 hover:underline"
                      title="Open in new tab"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
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
          <p className="mt-2 text-sm text-slate-500">Tap a title to read. Your place is saved automatically for PDFs.</p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Author</th>
                  <th className="px-3 py-2">Category</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Progress</th>
                  <th className="px-3 py-2 w-10" aria-label="Open in new tab" />
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
                    <td className="px-3 py-2 text-slate-600">{progressFor(b.id) || '—'}</td>
                    <td className="px-3 py-2">
                      {b.url ? (
                        <a
                          href={b.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex text-teal-700 hover:text-teal-900"
                          title="New tab"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {readerBook && currentDoctor?.uid && (
        <LibraryBookReader
          book={readerBook}
          userId={currentDoctor.uid}
          onClose={() => {
            setReaderBook(null);
            bumpProgress();
          }}
          onProgressSaved={bumpProgress}
        />
      )}
    </DoctorLayout>
  );
};

export default DoctorLibraryPage;
