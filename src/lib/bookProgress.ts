const STORAGE_PREFIX = 'lawhubb_library_progress_v1';

export interface BookProgress {
  page: number;
  numPages: number;
  updatedAt: number;
}

function key(uid: string, bookId: string): string {
  return `${STORAGE_PREFIX}_${uid}_${bookId}`;
}

export function getBookProgress(uid: string | undefined, bookId: string): BookProgress | null {
  if (!uid || typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key(uid, bookId));
    if (!raw) return null;
    const data = JSON.parse(raw) as BookProgress;
    if (typeof data.page !== 'number' || typeof data.numPages !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function setBookProgress(uid: string, bookId: string, data: BookProgress): void {
  try {
    localStorage.setItem(key(uid, bookId), JSON.stringify(data));
  } catch {
    /* quota or private mode */
  }
}

export function formatProgressLabel(p: BookProgress | null): string {
  if (!p || p.numPages < 1) return '';
  const pct = Math.min(100, Math.round((p.page / p.numPages) * 100));
  if (pct >= 100) return 'Finished';
  return `${pct}% · p. ${p.page}`;
}
