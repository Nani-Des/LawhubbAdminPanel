import React, { useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { toast } from 'react-hot-toast';
import { BookMarked, Filter, MessageCircle, PlusCircle, Send, ThumbsUp, Video } from 'lucide-react';
import DoctorLayout from '../../components/layout/DoctorLayout';
import { db, storage } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

type InsightDoc = {
  id: string;
  insightId?: string;
  userId?: string;
  userName?: string;
  title?: string;
  description?: string;
  category?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  mediaType?: 'image' | 'video' | '';
  likes?: number;
  commentsCount?: number;
  views?: number;
  isActive?: boolean;
  createdAt?: Timestamp;
  likedBy?: string[];
};

type InsightComment = {
  id: string;
  userId?: string;
  userName?: string;
  comment?: string;
  createdAt?: Timestamp;
};

const CATEGORY_OPTIONS = ['All', 'General', 'Case law', 'Compliance', 'Contracts', 'Litigation'];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const DoctorLawInsightsPage: React.FC = () => {
  const { currentDoctor } = useAuth();
  const [insights, setInsights] = useState<InsightDoc[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [filter, setFilter] = useState('All');
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'General',
    videoUrl: '',
  });
  const [saving, setSaving] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<File | null>(null);
  const [expandedInsightId, setExpandedInsightId] = useState<string | null>(null);
  const [commentsByInsight, setCommentsByInsight] = useState<Record<string, InsightComment[]>>({});
  const [commentDraftByInsight, setCommentDraftByInsight] = useState<Record<string, string>>({});
  const [commentSavingByInsight, setCommentSavingByInsight] = useState<Record<string, boolean>>({});

  React.useEffect(() => {
    const insightsRef = collection(db, 'law_insights');
    const thirtyDaysAgo = Timestamp.fromDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
    const q = query(
      insightsRef,
      where('createdAt', '>=', thirtyDaysAgo),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<InsightDoc, 'id'>) }));
        setInsights(rows.filter((x) => x.isActive !== false));
      },
      () => {
        toast.error('Could not load law insights.');
      }
    );
    return () => unsub();
  }, []);

  const visibleInsights = useMemo(() => {
    if (filter === 'All') return insights;
    return insights.filter((x) => (x.category || '').toLowerCase() === filter.toLowerCase());
  }, [insights, filter]);

  const onCreateInsight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDoctor?.uid) {
      toast.error('Please sign in again.');
      return;
    }
    if (!form.title.trim() || !form.description.trim()) {
      toast.error('Add a title and short description.');
      return;
    }
    if (form.videoUrl.trim() && !/^https?:\/\//i.test(form.videoUrl.trim())) {
      toast.error('Video URL should start with http:// or https://');
      return;
    }
    if (selectedMedia) {
      const isVideo = selectedMedia.type.startsWith('video/');
      const isImage = selectedMedia.type.startsWith('image/');
      if (!isVideo && !isImage) {
        toast.error('Choose an image or video file.');
        return;
      }
      if (isImage && selectedMedia.size > MAX_IMAGE_BYTES) {
        toast.error('Image must be 8MB or less.');
        return;
      }
      if (isVideo && selectedMedia.size > MAX_VIDEO_BYTES) {
        toast.error('Video must be 50MB or less.');
        return;
      }
    }
    setSaving(true);
    try {
      let uploadedUrl = '';
      let mediaType: 'image' | 'video' | '' = '';
      if (selectedMedia) {
        const safeName = selectedMedia.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const mediaRef = ref(
          storage,
          `law_insights/${currentDoctor.uid}/${Date.now()}_${safeName}`
        );
        await uploadBytes(mediaRef, selectedMedia);
        uploadedUrl = await getDownloadURL(mediaRef);
        mediaType = selectedMedia.type.startsWith('video/') ? 'video' : 'image';
      }
      const resolvedVideoUrl = mediaType === 'video' ? uploadedUrl : form.videoUrl.trim();
      const resolvedThumbnailUrl = mediaType === 'image' ? uploadedUrl : '';

      const insightRef = doc(collection(db, 'law_insights'));
      await setDoc(insightRef, {
        insightId: insightRef.id,
        userId: currentDoctor.uid,
        userName: currentDoctor.name || 'Member',
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        videoUrl: resolvedVideoUrl,
        thumbnailUrl: resolvedThumbnailUrl,
        mediaType,
        views: 0,
        viewedBy: [],
        commentsCount: 0,
        likes: 0,
        likedBy: [],
        engagementScore: 0,
        externalPlatforms: {},
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
        isActive: true,
      });
      toast.success('Insight posted.');
      setForm({ title: '', description: '', category: 'General', videoUrl: '' });
      setSelectedMedia(null);
      setIsCreating(false);
    } catch (err) {
      console.error('Failed to create insight:', err);
      toast.error('Could not post insight.');
    } finally {
      setSaving(false);
    }
  };

  const toggleLike = async (insightId: string) => {
    if (!currentDoctor?.uid) {
      toast.error('Please sign in again.');
      return;
    }
    try {
      const insightRef = doc(db, 'law_insights', insightId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(insightRef);
        if (!snap.exists()) return;
        const data = snap.data() as Record<string, unknown>;
        const likedBy = Array.isArray(data.likedBy) ? [...(data.likedBy as string[])] : [];
        const idx = likedBy.indexOf(currentDoctor.uid);
        if (idx >= 0) likedBy.splice(idx, 1);
        else likedBy.push(currentDoctor.uid);
        tx.update(insightRef, {
          likedBy,
          likes: likedBy.length,
        });
      });
    } catch (err) {
      console.error('Failed to toggle like:', err);
      toast.error('Could not update like.');
    }
  };

  const toggleComments = (insightId: string) => {
    setExpandedInsightId((prev) => (prev === insightId ? null : insightId));
  };

  React.useEffect(() => {
    if (!expandedInsightId) return;
    const commentsRef = collection(db, 'law_insights', expandedInsightId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<InsightComment, 'id'>) }));
      setCommentsByInsight((prev) => ({ ...prev, [expandedInsightId]: items }));
    });
    return () => unsub();
  }, [expandedInsightId]);

  const submitComment = async (insightId: string) => {
    if (!currentDoctor?.uid) {
      toast.error('Please sign in again.');
      return;
    }
    const text = (commentDraftByInsight[insightId] || '').trim();
    if (!text) return;
    setCommentSavingByInsight((prev) => ({ ...prev, [insightId]: true }));
    try {
      const commentRef = doc(collection(db, 'law_insights', insightId, 'comments'));
      await setDoc(commentRef, {
        commentId: commentRef.id,
        userId: currentDoctor.uid,
        userName: currentDoctor.name || 'Member',
        userPic: '',
        comment: text,
        createdAt: serverTimestamp(),
      });

      const insightRef = doc(db, 'law_insights', insightId);
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(insightRef);
        if (!snap.exists()) return;
        const data = snap.data() as Record<string, unknown>;
        const currentComments = typeof data.commentsCount === 'number' ? data.commentsCount : 0;
        const views = typeof data.views === 'number' ? data.views : 0;
        const nextComments = currentComments + 1;
        tx.update(insightRef, {
          commentsCount: nextComments,
          engagementScore: views + nextComments * 2,
        });
      });

      setCommentDraftByInsight((prev) => ({ ...prev, [insightId]: '' }));
    } catch (err) {
      console.error('Failed to add comment:', err);
      toast.error('Could not post comment.');
    } finally {
      setCommentSavingByInsight((prev) => ({ ...prev, [insightId]: false }));
    }
  };

  return (
    <DoctorLayout>
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Law Insights</h1>
            <p className="mt-1 text-sm text-slate-600">Share legal updates, practical notes, and useful video explainers.</p>
          </div>
          <button
            type="button"
            onClick={() => setIsCreating((s) => !s)}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
          >
            <PlusCircle className="h-4 w-4" />
            {isCreating ? 'Close form' : 'Create insight'}
          </button>
        </div>

        {isCreating && (
          <form onSubmit={onCreateInsight} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Title</span>
                <input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                  placeholder="What legal point are you sharing?"
                  required
                />
              </label>
              <label className="text-sm text-slate-700">
                <span className="mb-1 block font-medium">Category</span>
                <select
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2"
                >
                  {CATEGORY_OPTIONS.filter((x) => x !== 'All').map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Description</span>
              <textarea
                rows={4}
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                placeholder="Explain the insight in plain language."
                required
              />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Video URL (optional)</span>
              <input
                value={form.videoUrl}
                onChange={(e) => setForm((p) => ({ ...p, videoUrl: e.target.value }))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2"
                placeholder="https://..."
              />
            </label>
            <label className="text-sm text-slate-700">
              <span className="mb-1 block font-medium">Upload image or video (optional)</span>
              <input
                type="file"
                accept="image/*,video/*"
                onChange={(e) => setSelectedMedia(e.target.files?.[0] || null)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700"
              />
              {selectedMedia && (
                <p className="mt-1 text-xs text-slate-500">
                  Selected: {selectedMedia.name}
                </p>
              )}
            </label>
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? 'Posting...' : 'Post insight'}
              </button>
            </div>
          </form>
        )}

        <div className="flex items-center gap-2 text-sm">
          <Filter className="h-4 w-4 text-slate-500" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-slate-700"
          >
            {CATEGORY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span className="text-slate-500">{visibleInsights.length} post(s)</span>
        </div>

        <div className="space-y-3">
          {visibleInsights.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
              <BookMarked className="mx-auto mb-2 h-6 w-6 text-slate-400" />
              No insights yet in this category.
            </div>
          )}
          {visibleInsights.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{item.title || 'Untitled insight'}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {(item.userName || 'Member')} · {item.category || 'General'}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : ''}
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{item.description || ''}</p>
              {!item.videoUrl && item.thumbnailUrl && (
                <img
                  src={item.thumbnailUrl}
                  alt={item.title || 'Insight image'}
                  className="mt-3 max-h-80 w-full rounded-xl border border-slate-200 object-cover"
                />
              )}
              {item.videoUrl && (
                <>
                  {item.mediaType === 'video' ? (
                    <video className="mt-3 max-h-80 w-full rounded-xl border border-slate-200" controls src={item.videoUrl} />
                  ) : (
                    <a
                      href={item.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-700 hover:bg-teal-100"
                    >
                      <Video className="h-4 w-4" />
                      Watch video
                    </a>
                  )}
                </>
              )}
              <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
                <button
                  type="button"
                  onClick={() => toggleLike(item.id)}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 ${
                    item.likedBy?.includes(currentDoctor?.uid || '')
                      ? 'bg-teal-50 text-teal-700'
                      : 'hover:bg-slate-100'
                  }`}
                >
                  <ThumbsUp className="h-3.5 w-3.5" /> {item.likes || 0} likes
                </button>
                <button
                  type="button"
                  onClick={() => toggleComments(item.id)}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-slate-100"
                >
                  <MessageCircle className="h-3.5 w-3.5" /> {item.commentsCount || 0} comments
                </button>
                <span>{item.views || 0} views</span>
              </div>
              {expandedInsightId === item.id && (
                <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="max-h-56 space-y-2 overflow-auto pr-1">
                    {(commentsByInsight[item.id] || []).length === 0 && (
                      <p className="text-xs text-slate-500">No comments yet.</p>
                    )}
                    {(commentsByInsight[item.id] || []).map((c) => (
                      <div key={c.id} className="rounded-lg bg-white p-2.5 shadow-sm">
                        <p className="text-xs font-semibold text-slate-700">{c.userName || 'Member'}</p>
                        <p className="mt-0.5 text-sm text-slate-700">{c.comment || ''}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      value={commentDraftByInsight[item.id] || ''}
                      onChange={(e) =>
                        setCommentDraftByInsight((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                      placeholder="Add a comment..."
                    />
                    <button
                      type="button"
                      onClick={() => submitComment(item.id)}
                      disabled={!!commentSavingByInsight[item.id]}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      <Send className="h-3.5 w-3.5" />
                      {commentSavingByInsight[item.id] ? 'Sending' : 'Send'}
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </DoctorLayout>
  );
};

export default DoctorLawInsightsPage;
