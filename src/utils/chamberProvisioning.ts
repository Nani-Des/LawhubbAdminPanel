import {
  arrayUnion,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import { Chamber, Practice } from '../types';
import { countryNameFromCode } from '../constants/countries';
import { rankBySimilarity, slugifyId, toTitleCase } from './stringSimilarity';

export interface NewChamberInput {
  chamberId: string;
  chamberName: string;
  location: string;
  city: string;
  /** ISO 3166-1 alpha-2 country code */
  countryCode: string;
  contact: string;
  email?: string;
  lat?: string | number;
  lng?: string | number;
}

export interface NewPracticeInput {
  practiceId: string;
  practiceName: string;
}

export function chamberDisplayName(chamber: Chamber): string {
  return String(chamber['Chamber Name'] || chamber.name || chamber.id);
}

export function practiceDisplayName(practice: Practice): string {
  return String(practice['Practice Name'] || practice['Practice ID'] || practice.id);
}

export function suggestChamberIdFromName(name: string): string {
  const base = slugifyId(name);
  return base || `chamber_${Date.now().toString(36)}`;
}

export function suggestPracticeIdFromName(name: string): string {
  const base = slugifyId(name);
  const suffix = Math.random().toString(36).slice(2, 7);
  return base ? `${base}_${suffix}` : crypto.randomUUID();
}

export function findSimilarChambers(query: string, chambers: Chamber[]) {
  return rankBySimilarity(query, chambers, chamberDisplayName, 0.55, 5);
}

export function findSimilarPractices(query: string, practices: Practice[]) {
  return rankBySimilarity(query, practices, practiceDisplayName, 0.55, 5);
}

export async function chamberIdExists(chamberId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'Chamber', chamberId));
  return snap.exists();
}

export async function practiceIdExists(practiceId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'Practice', practiceId));
  return snap.exists();
}

export async function createChamber(input: NewChamberInput): Promise<string> {
  const chamberId = input.chamberId.trim();
  if (!chamberId) throw new Error('Chamber ID is required');

  const exists = await chamberIdExists(chamberId);
  if (exists) throw new Error(`Chamber ID "${chamberId}" already exists`);

  const countryCode = input.countryCode.trim().toUpperCase();
  const countryName = countryNameFromCode(countryCode);
  const chamberName = toTitleCase(input.chamberName);

  await setDoc(doc(db, 'Chamber', chamberId), {
    'Chamber ID': chamberId,
    'Chamber Name': chamberName,
    name: chamberName,
    Location: input.location.trim(),
    City: input.city.trim(),
    Region: countryName,
    Country: countryCode,
    Contact: input.contact.trim(),
    email: input.email?.trim() || '',
    phone: input.contact.trim(),
    address: input.location.trim(),
    Lat: input.lat ?? 0,
    Lng: input.lng ?? 0,
    Logo: '',
    'Background Image': '',
    'Chamber Practice': [],
    'Shift Timings': {},
    lastUpdated: serverTimestamp(),
    averageRating: 0,
    ratingCount: 0,
  });

  return chamberId;
}

export async function createPracticeDoc(input: NewPracticeInput): Promise<string> {
  const practiceId = input.practiceId.trim();
  const practiceName = toTitleCase(input.practiceName);
  if (!practiceId || !practiceName) {
    throw new Error('Practice ID and name are required');
  }

  const practiceRef = doc(db, 'Practice', practiceId);
  const existing = await getDoc(practiceRef);
  if (!existing.exists()) {
    await setDoc(practiceRef, {
      'Practice ID': practiceId,
      'Practice Name': practiceName,
    });
  }

  return practiceId;
}

export async function linkPracticeToChamber(
  chamberId: string,
  practiceId: string
): Promise<void> {
  const chamberRef = doc(db, 'Chamber', chamberId);
  const chamberSnap = await getDoc(chamberRef);
  if (!chamberSnap.exists()) {
    throw new Error(`Chamber "${chamberId}" not found`);
  }

  const current = ((chamberSnap.data()['Chamber Practice'] || []) as unknown[]).filter(
    (id): id is string => typeof id === 'string'
  );
  if (current.includes(practiceId)) return;

  await updateDoc(chamberRef, {
    'Chamber Practice': arrayUnion(practiceId),
    lastUpdated: serverTimestamp(),
  });
}

export async function ensurePracticeOnChamber(
  chamberId: string,
  practiceName: string,
  practiceId?: string
): Promise<string> {
  const trimmedName = practiceName.trim();
  if (!trimmedName) throw new Error('Practice name is required');

  const resolvedId = practiceId?.trim() || suggestPracticeIdFromName(trimmedName);
  await createPracticeDoc({ practiceId: resolvedId, practiceName: trimmedName });
  await linkPracticeToChamber(chamberId, resolvedId);
  return resolvedId;
}

export async function fetchPracticesForChamber(chamberId: string): Promise<Practice[]> {
  const chamberSnap = await getDoc(doc(db, 'Chamber', chamberId));
  if (!chamberSnap.exists()) return [];

  const ids = ((chamberSnap.data()['Chamber Practice'] || []) as unknown[]).filter(
    (id): id is string => typeof id === 'string'
  );
  if (!ids.length) return [];

  const practices: Practice[] = [];
  for (const id of ids) {
    const pSnap = await getDoc(doc(db, 'Practice', id));
    if (pSnap.exists()) {
      practices.push({
        id: pSnap.id,
        'Practice ID': pSnap.id,
        'Practice Name': (pSnap.data()['Practice Name'] as string) || '',
      });
    }
  }
  return practices;
}

/** Collect custom practice names from a verification request. */
export function collectApplicantPracticeNames(request: {
  practiceId?: string;
  practiceName?: string;
  altPractice?: string[];
}): string[] {
  const names = new Set<string>();
  const primary = request.practiceName?.trim();
  if (primary && !request.practiceId) {
    names.add(primary);
  }
  for (const p of request.altPractice || []) {
    const t = p.trim();
    if (t) names.add(t);
  }
  return [...names];
}

export function applicantHasChamberInfo(request: {
  chamberId?: string;
  chamberName?: string;
  altChamber?: string;
}): boolean {
  return Boolean(
    request.chamberId?.trim() ||
      request.chamberName?.trim() ||
      request.altChamber?.trim()
  );
}
