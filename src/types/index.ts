import { Timestamp } from "firebase/firestore";

// Backward compatibility aliases
export type Hospital = Chamber;
export type Department = Practice;

export interface Chamber {
  id: string;
  "Chamber ID": string;
  "Chamber Name": string; 
  ["Chamber Practice"]:[]
  Location: string;
  City: string;
  Contact: string;
  Lat: string | number;
  Lng: string | number;
  Region: string;
  "Background Image": string;
  Logo: string;
  "Shift Timings": object;
  lastUpdated: object;
  averageRating: number;
  ratingCount: number;
  "Chamber Practice": object | [];
  name: string;
  address: string;
  phone: string;
  email: string;
}

export interface Admin {
  id: string;
  name: string;
  pin: string;
  hospitalId: string;
  email: string;
  phone: string;
  lastLogin: string;
  isAdmin: boolean
}

export interface Practice {
  id: string;
  ["Practice ID"]: string;
  ["Practice Name"]: string;
}

export interface Users {
  id: string;
  ["User ID"]:string;
  Fname: string;
  Lname: string;
  ["Practice ID"]: string;
  ["Chamber ID"]: string;
  Title: string;
  Email: string;
  Designation: string;
  ["Mobile Number"]: string;
  Role: boolean
  Status: boolean;
  CreatedAt: Timestamp;
  // Schedule: Schedule;
  Region: string;
  /** ISO 3166-1 alpha-2 (e.g. GH). Missing legacy users treated as Ghana in app logic. */
  Country?: string;
  'User Pic': String ;
  Permissions?: string[] | { [key: string]: boolean };
  fcmToken?: string;
  lastSeen?: Timestamp;
  isOnline?: boolean;
  Experience?: string;
  baseRole?: string;
}

export interface Schedule {
  ["Active Days"]: number;
  ["Off Days"]: number;
  ["Shift"]: number;
  ["Shift Start"]: Timestamp;
  ["Shift Switch"]: number;
}


export interface Attachment {
  id: string;
  chamberId: string;
  assignedLawyerId: string;
  createdAt: string;
  updatedAt: string;
  fileUrl: string; // <- this should be in your record
  fileType: 'pdf' | 'image'; // optional but useful
}

// Backward compatibility alias
export type MedicalRecord = Attachment;

export interface Service {
  id?: string;
  "Service Name": string;
  Days: string[];
  Time: string;
   'Post ID': string;
    Description: string;
}

export interface ForumPost {
  id: string;
  title: string;
  content: string;
  createdAt: string;
}


export interface Referral {
  id: string;
  'Serial Number'?: string;
  'Name'?: string;
  'Age'?: string;
  'Date of Birth'?: string;
  'Sex'?: string;
  'Reason for Referral'?: string;
  'Referred By'?: string;
  'Uploaded Attachments'?: string;
  // add any other properties you access in your code
  }

export interface Notification {
  id: string;
  chamberId: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success';
  read: boolean;
  createdAt: string;
}


export interface Metrics {
  totalAttachments: number;
  totalPractices: number;
  totalUsers: number;
  totalLawyers: number;
  // Backward compatibility
  totalMedicalRecords?: number;
}