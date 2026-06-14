import { collection, doc, getDoc, getDocs, limit, query, where } from 'firebase/firestore';
import { db } from '../firebase';

/** Placeholder chamber for applicants who type a custom chamber name. */
export const NA_CHAMBER_NAME = 'Chamber [N/A]';

let cachedNaChamberId: string | null | undefined;

export async function resolveNaChamberId(): Promise<string | null> {
  if (cachedNaChamberId !== undefined) return cachedNaChamberId;

  const byName = await getDocs(
    query(collection(db, 'Chamber'), where('Chamber Name', '==', NA_CHAMBER_NAME), limit(1))
  );
  if (!byName.empty) {
    cachedNaChamberId = byName.docs[0].id;
    return cachedNaChamberId;
  }

  const fallbackId = 'chamber_na';
  const fallbackSnap = await getDoc(doc(db, 'Chamber', fallbackId));
  if (fallbackSnap.exists()) {
    cachedNaChamberId = fallbackId;
    return cachedNaChamberId;
  }

  cachedNaChamberId = null;
  return null;
}
