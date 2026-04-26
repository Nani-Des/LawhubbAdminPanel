import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from "firebase/auth";
import { firebaseConfig } from "../firebase";

const SECONDARY_APP_NAME = "lawhubb-managed-user-provisioning";

export interface ProvisionedAuthUser {
  user: User;
  auth: Auth;
  release: () => Promise<void>;
}

function getSecondaryApp(): FirebaseApp {
  const existingApp = getApps().find((app) => app.name === SECONDARY_APP_NAME);
  if (existingApp) return existingApp;
  return initializeApp(firebaseConfig, SECONDARY_APP_NAME);
}

/**
 * Creates a user with an isolated auth instance so the primary admin session is not replaced.
 */
export async function createManagedAuthUser(
  email: string,
  password: string,
  displayName?: string
): Promise<ProvisionedAuthUser> {
  const secondaryAuth = getAuth(getSecondaryApp());
  const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);

  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }

  return {
    user: credential.user,
    auth: secondaryAuth,
    release: async () => {
      if (secondaryAuth.currentUser) {
        await signOut(secondaryAuth);
      }
    },
  };
}
