/**
 * GPP Portal — Firebase Cloud Function
 * Triggered when a document is created in `notification_requests`
 * Reads FCM tokens for target roles → sends push via FCM multicast → deletes the request
 *
 * Deploy: firebase deploy --only functions
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp }     = require('firebase-admin/app');
const { getMessaging }      = require('firebase-admin/messaging');
const { getFirestore }      = require('firebase-admin/firestore');

initializeApp();

exports.sendApprovalPush = onDocumentCreated(
  'notification_requests/{reqId}',
  async (event) => {
    const req  = event.data?.data();
    if (!req?.title) return;

    const db      = getFirestore();
    const reqRef  = event.data.ref;

    const { title, body, url = '/', targetRoles = [] } = req;

    // Collect FCM tokens for users with matching roles
    const tokensSnap = await db.collection('fcm_tokens').get();
    const tokens = [];
    tokensSnap.forEach(doc => {
      const d = doc.data();
      if (!d.token) return;
      const role = d.role || 'staff'; // default to staff if role not saved
      const roleMatch = targetRoles.length === 0
        || targetRoles.includes(role)
        || role === 'superadmin'
        || role === 'director';
      if (roleMatch) tokens.push(d.token);
    });

    // Deduplicate
    const unique = [...new Set(tokens)];
    if (unique.length === 0) {
      await reqRef.delete();
      return;
    }

    try {
      const result = await getMessaging().sendEachForMulticast({
        tokens: unique,
        notification: { title, body },
        data: { url },
        webpush: {
          fcmOptions: { link: url },
          notification: {
            title,
            body,
            icon: 'https://app.globalpetro.co.id/favicon.png',
            badge: 'https://app.globalpetro.co.id/favicon.png',
          },
        },
      });
      console.log(`FCM sent: ${result.successCount} success, ${result.failureCount} failed`);

      // Remove stale tokens that permanently failed
      const staleKeys = [];
      result.responses.forEach((resp, i) => {
        if (!resp.success &&
          (resp.error?.code === 'messaging/registration-token-not-registered' ||
           resp.error?.code === 'messaging/invalid-registration-token')) {
          staleKeys.push(unique[i]);
        }
      });
      if (staleKeys.length > 0) {
        const batch = db.batch();
        const snap = await db.collection('fcm_tokens').get();
        snap.forEach(doc => {
          if (staleKeys.includes(doc.data().token)) batch.delete(doc.ref);
        });
        await batch.commit();
      }
    } catch (err) {
      console.error('FCM error:', err);
    }

    // Always delete the request document when done
    await reqRef.delete();
  }
);
