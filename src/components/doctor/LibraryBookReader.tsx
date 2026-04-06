import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ref, getBytes } from 'firebase/storage';
import { X, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import Button from '../ui/Button';
import { getBookProgress, setBookProgress, type BookProgress } from '../../lib/bookProgress';
import { storage } from '../../firebase';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface LibraryBook {
  id: string;
  title?: string;
  url?: string;
  fileType?: string;
}

interface LibraryBookReaderProps {
  book: LibraryBook;
  userId: string;
  onClose: () => void;
  onProgressSaved: () => void;
}

function isPdfBook(book: LibraryBook): boolean {
  const ext = (book.fileType || '').toLowerCase();
  if (ext === 'pdf') return true;
  const u = book.url?.split('?')[0].toLowerCase() || '';
  return u.endsWith('.pdf');
}

function isWordBook(book: LibraryBook): boolean {
  const ext = (book.fileType || '').toLowerCase();
  return ext === 'doc' || ext === 'docx';
}

/** Firebase download URLs hit CORS when pdf.js uses fetch(); load bytes via the Storage SDK instead. */
function isFirebaseStorageDownloadUrl(u: string): boolean {
  return u.includes('firebasestorage.googleapis.com') || u.includes('storage.googleapis.com');
}

const LibraryBookReader: React.FC<LibraryBookReaderProps> = ({ book, userId, onClose, onProgressSaved }) => {
  const url = book.url || '';
  const pdf = isPdfBook(book);
  const word = !pdf && isWordBook(book);

  const onProgressSavedRef = useRef(onProgressSaved);
  onProgressSavedRef.current = onProgressSaved;

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfError, setPdfError] = useState<string | null>(null);
  /** In-memory PDF for Firebase URLs (avoids browser CORS on storage.googleapis.com). */
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    setPdfBytes(null);
    setPdfError(null);
    setNumPages(0);
    setPageNumber(1);
  }, [book.id, url]);

  useEffect(() => {
    if (!pdf || !url) return;
    if (!isFirebaseStorageDownloadUrl(url)) {
      setPdfBytes(null);
      return;
    }
    let cancelled = false;
    setPdfLoading(true);
    setPdfError(null);
    (async () => {
      try {
        const storageRef = ref(storage, url);
        const buf = await getBytes(storageRef);
        if (cancelled) return;
        setPdfBytes(new Uint8Array(buf));
      } catch (e) {
        if (!cancelled) {
          setPdfError(e instanceof Error ? e.message : 'Could not download this book.');
        }
      } finally {
        if (!cancelled) setPdfLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pdf, url, book.id]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(Math.floor(w));
    });
    ro.observe(el);
    setContainerWidth(Math.floor(el.clientWidth) || 600);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf || numPages < 1) return;
    const data: BookProgress = { page: pageNumber, numPages, updatedAt: Date.now() };
    setBookProgress(userId, book.id, data);
    onProgressSavedRef.current();
  }, [pdf, pageNumber, numPages, userId, book.id]);

  const onPdfLoadSuccess = useCallback(
    ({ numPages: total }: { numPages: number }) => {
      setNumPages(total);
      setPdfError(null);
      const saved = getBookProgress(userId, book.id);
      if (saved && saved.page >= 1 && saved.page <= total) {
        setPageNumber(saved.page);
      } else {
        setPageNumber(1);
      }
    },
    [userId, book.id]
  );

  const goPrev = () => setPageNumber((p) => Math.max(1, p - 1));
  const goNext = () => setPageNumber((p) => Math.min(numPages || 1, p + 1));

  const officeEmbed =
    word && url
      ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
      : null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/70 p-3 sm:p-6 backdrop-blur-sm">
      <div className="flex h-[min(92vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200">
        <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold text-slate-900">{book.title || 'Book'}</h2>
            {pdf && numPages > 0 && (
              <p className="text-xs text-slate-500">
                Page {pageNumber} of {numPages}
              </p>
            )}
            {word && <p className="text-xs text-slate-500">Preview may take a moment</p>}
          </div>

          {pdf && numPages > 0 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={goPrev}
                disabled={pageNumber <= 1}
                className="rounded-lg p-2 text-slate-700 hover:bg-slate-200 disabled:opacity-30"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={pageNumber >= numPages}
                className="rounded-lg p-2 text-slate-700 hover:bg-slate-200 disabled:opacity-30"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}

          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-teal-700 hover:bg-teal-50"
            >
              <ExternalLink className="h-4 w-4" />
              New tab
            </a>
          )}

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-200"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
        </header>

        <div ref={containerRef} className="relative min-h-0 flex-1 overflow-auto bg-slate-100">
          {pdf && url && (
            <div className="flex min-h-full justify-center px-2 py-4">
              {pdfError && (
                <div className="m-auto max-w-md p-6 text-center">
                  <p className="text-slate-700">{pdfError}</p>
                  <Button type="button" className="mt-4" onClick={onClose}>
                    Close
                  </Button>
                </div>
              )}
              {isFirebaseStorageDownloadUrl(url) && pdfLoading && !pdfError && (
                <div className="flex justify-center py-24 text-slate-500">Opening book…</div>
              )}
              {isFirebaseStorageDownloadUrl(url) && !pdfLoading && !pdfBytes && !pdfError && (
                <div className="m-auto max-w-md p-6 text-center text-slate-600">Could not load this file.</div>
              )}
              {!pdfError &&
                (isFirebaseStorageDownloadUrl(url) ? pdfBytes != null : true) &&
                (!isFirebaseStorageDownloadUrl(url) || pdfBytes) && (
                  <Document
                    key={book.id}
                    file={isFirebaseStorageDownloadUrl(url) && pdfBytes ? pdfBytes : url}
                    onLoadSuccess={onPdfLoadSuccess}
                    onLoadError={(e) => {
                      setPdfError(e?.message || 'Could not load this book.');
                    }}
                    loading={
                      <div className="flex justify-center py-24 text-slate-500">Opening book…</div>
                    }
                    className="flex flex-col items-center gap-4"
                  >
                    {containerWidth > 0 && numPages > 0 && (
                      <Page
                        pageNumber={pageNumber}
                        width={Math.min(containerWidth - 16, 920)}
                        renderTextLayer
                        renderAnnotationLayer
                      />
                    )}
                  </Document>
                )}
            </div>
          )}

          {word && officeEmbed && (
            <iframe title={book.title || 'Document'} src={officeEmbed} className="h-[min(75vh,720px)] w-full border-0" />
          )}

          {!pdf && !word && url && (
            <div className="flex flex-col items-center justify-center gap-4 p-10 text-center">
              <p className="text-slate-600">This file type opens best in another app.</p>
              <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-teal-700 underline">
                Open file
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LibraryBookReader;
