import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../firebase";
import type { Users } from "../types";

export function resolveMemberAuthUid(user: Pick<Users, "id" | "User ID">): string {
  const fromField = typeof user["User ID"] === "string" ? user["User ID"].trim() : "";
  return fromField || user.id;
}

export function isAllowedMemberPassword(password: string): boolean {
  return /^[A-Za-z0-9]{6,}$/.test(password.trim());
}

export async function adminSetMemberPassword(
  authUid: string,
  newPassword: string
): Promise<void> {
  const functions = getFunctions(app);
  const setMemberPassword = httpsCallable<
    { authUid: string; newPassword: string },
    { success: boolean }
  >(functions, "setMemberPassword");

  await setMemberPassword({ authUid, newPassword: newPassword.trim() });
}
