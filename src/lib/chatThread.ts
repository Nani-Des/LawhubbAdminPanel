import { addDoc, collection, getDocs, query, serverTimestamp, where } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Matches mobile (`doctor_info_widget.dart`): find `Chats` where both users are participants, or create one.
 */
export async function getOrCreateChatThread(userIdA: string, userIdB: string): Promise<string> {
  const chatsRef = collection(db, 'Chats');
  const snap = await getDocs(query(chatsRef, where('participants', 'array-contains', userIdA)));
  for (const docSnap of snap.docs) {
    const parts = docSnap.data().participants as string[] | undefined;
    if (parts?.includes(userIdB)) {
      return docSnap.id;
    }
  }
  const newRef = await addDoc(chatsRef, {
    participants: [userIdA, userIdB],
    createdAt: serverTimestamp(),
  });
  return newRef.id;
}
