import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  initializeAuth,
  inMemoryPersistence,
  signInWithEmailAndPassword,
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

let secondaryAuth: Auth | null = null;

function getSecondaryApp(): FirebaseApp {
  const existingApp = getApps().find((app) => app.name === SECONDARY_APP_NAME);
  if (existingApp) return existingApp;
  return initializeApp(firebaseConfig, SECONDARY_APP_NAME);
}

/**
 * Isolated auth instance (in-memory only) so provisioning a new account does not
 * replace the admin's persisted browser session on the primary auth instance.
 */
function getSecondaryAuth(): Auth {
  if (secondaryAuth) return secondaryAuth;

  const secondaryApp = getSecondaryApp();
  secondaryAuth = initializeAuth(secondaryApp, {
    persistence: inMemoryPersistence,
  });
  return secondaryAuth;
}

/**
 * Creates a user with an isolated auth instance so the primary admin session is not replaced.
 */
export async function createManagedAuthUser(
  email: string,
  password: string,
  displayName?: string
): Promise<ProvisionedAuthUser> {
  const auth = getSecondaryAuth();
  const credential = await createUserWithEmailAndPassword(auth, email, password);

  if (displayName) {
    await updateProfile(credential.user, { displayName });
  }

  return {
    user: credential.user,
    auth,
    release: async () => {
      if (auth.currentUser) {
        await signOut(auth);
      }
    },
  };
}

/**
 * Signs in with an isolated auth instance (same secondary app as provisioning) so the browser's
 * primary Firebase Auth session is unchanged — used on public flows like lawyer signup with an existing account.
 */
export async function signInExistingUserForProvisioning(
  email: string,
  password: string
): Promise<ProvisionedAuthUser> {
  const auth = getSecondaryAuth();
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);

  return {
    user: credential.user,
    auth,
    release: async () => {
      if (auth.currentUser) {
        await signOut(auth);
      }
    },
  };
}

/** Deletes a user created through the isolated provisioning auth instance. */
export async function deleteProvisionedAuthUser(provisioned: ProvisionedAuthUser): Promise<void> {
  try {
    await deleteUser(provisioned.user);
  } finally {
    await provisioned.release();
  }
}
