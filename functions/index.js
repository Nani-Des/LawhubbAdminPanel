const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

initializeApp();

const ADMIN_ROLES = new Set([
  "hospital_admin",
  "hospital_manager",
  "chamber_admin",
  "chamber_manager",
  "main_admin",
]);

function readBaseRole(data) {
  return data?.baseRole ?? data?.BaseRole ?? data?.["Base Role"];
}

function chamberIdOf(data) {
  return (
    data?.["Chamber ID"] ??
    data?.chamberId ??
    data?.hospitalId ??
    data?.["Hospital ID"]
  );
}

exports.setMemberPassword = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  const { authUid, newPassword } = request.data || {};
  if (!authUid || typeof authUid !== "string") {
    throw new HttpsError("invalid-argument", "authUid is required.");
  }
  if (
    !newPassword ||
    typeof newPassword !== "string" ||
    !/^[A-Za-z0-9]{6,}$/.test(newPassword)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Password must be at least 6 characters and contain only letters and numbers."
    );
  }

  const db = getFirestore();
  const callerSnap = await db.collection("Users").doc(request.auth.uid).get();
  if (!callerSnap.exists) {
    throw new HttpsError("permission-denied", "Caller profile not found.");
  }

  const caller = callerSnap.data();
  const callerRole = readBaseRole(caller);
  if (!ADMIN_ROLES.has(callerRole)) {
    throw new HttpsError(
      "permission-denied",
      "Only chamber administrators can reset member passwords."
    );
  }

  const callerChamber = chamberIdOf(caller);
  const isMainAdmin = callerRole === "main_admin";

  let targetSnap = await db.collection("Users").doc(authUid).get();
  if (!targetSnap.exists) {
    const querySnap = await db
      .collection("Users")
      .where("User ID", "==", authUid)
      .limit(1)
      .get();
    if (querySnap.empty) {
      throw new HttpsError("not-found", "Member profile not found.");
    }
    targetSnap = querySnap.docs[0];
  }

  const target = targetSnap.data();
  const targetChamber = chamberIdOf(target);
  if (
    !isMainAdmin &&
    callerChamber &&
    targetChamber &&
    callerChamber !== targetChamber
  ) {
    throw new HttpsError(
      "permission-denied",
      "Member is not in your chamber."
    );
  }

  try {
    await getAuth().updateUser(authUid, { password: newPassword });
  } catch (err) {
    const code = err?.code || err?.errorInfo?.code;
    if (code === "auth/user-not-found") {
      throw new HttpsError(
        "not-found",
        "No authentication account exists for this member."
      );
    }
    throw new HttpsError("internal", err?.message || "Failed to update password.");
  }

  return { success: true };
});
