// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";
import { getStorage } from 'firebase/storage';
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional

export const firebaseConfig = {
  apiKey: "AIzaSyBUjC1z2KoPJKhpRp-OQ8CZP4-yGnSMQw8",
  authDomain: "lawhub-393ad.firebaseapp.com",
  projectId: "lawhub-393ad",
  storageBucket: "lawhub-393ad.firebasestorage.app",
  messagingSenderId: "495024454539",
  appId: "1:495024454539:web:3291f8bb72a8d744ddcd8e",
  measurementId: "G-R6H2XXTSG4"
};


// Initialize Firebase
export const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);
export const functions = getFunctions(app);

