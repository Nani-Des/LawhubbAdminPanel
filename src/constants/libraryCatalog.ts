export const LIBRARY_CATEGORIES = [
  'Criminal Law',
  'Civil Law',
  'Corporate / Commercial Law',
  'Constitutional Law',
  'Family Law',
  'Property / Land Law',
  'Employment / Labour Law',
  'Tax Law',
  'Intellectual Property',
  'Human Rights',
  'International Law',
  'Practice Manuals',
  'Case Digests',
  'Statutes / Acts',
  'Legal Ethics',
  'Other',
] as const;

export const LIBRARY_FILE_TYPES = ['pdf', 'doc', 'docx'] as const;

/** Platform share of each bookshop sale (10%). Remainder is credited to the seller. */
export const LIBRARY_PLATFORM_FEE_RATE = 0.1;
