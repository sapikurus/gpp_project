/**
 * GPP Portal — Firebase Cloud Function (v2 / gen 2)
 * Already deployed as gen 2 — keep v2 syntax.
 * Triggered on creation of notification_requests/{reqId}
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp }     = require('firebase-admin/app');
const { getMessaging }      = require('firebase-admin/messaging');
const { getFirestore }      = require('firebase-admin/firestore');

initializeApp();

const APP_URL = 'https://gpp.globalpetro.co.id';

exports.sendApprovalPush = onDocumentCreated(
  { document: 'notification_requests/{reqId}', region: 'asia-southeast1' },
  async (event) => {
    const req   = event.data?.data();
    const reqId = event.params.reqId;

    if (!req?.title) {
      console.log(`[${reqId}] Skipped — no title`);
      return;
    }

    const db     = getFirestore();
    const reqRef = event.data.ref;
    const { title, body, url = '/', targetRoles = [] } = req;
    const clickUrl = url.startsWith('http') ? url : `${APP_URL}${url}`;

    console.log(`[${reqId}] "${title}" → targetRoles: [${targetRoles.join(', ') || 'ALL'}]`);

    // Read FCM tokens
    let tokensSnap;
    try {
      tokensSnap = await db.collection('fcm_tokens').get();
    } catch (err) {
      console.error(`[${reqId}] fcm_tokens read failed:`, err.message);
      await reqRef.delete();
      return;
    }

    console.log(`[${reqId}] ${tokensSnap.size} registered device(s)`);

    // Match by role
    const tokens   = [];
    const tokenMap = {};
    tokensSnap.forEach(d => {
      const data = d.data();
      if (!data.token) return;
      const role  = data.role || 'staff';
      const match = targetRoles.length === 0
        || targetRoles.includes(role)
        || role === 'superadmin'
        || role === 'director';
      if (match) {
        tokens.push(data.token);
        tokenMap[data.token] = d.ref;
        console.log(`[${reqId}]   ✓ ${data.email} (${role})`);
      } else {
        console.log(`[${reqId}]   ✗ ${data.email} (${role})`);
      }
    });

    const unique = [...new Set(tokens)];
    if (unique.length === 0) {
      console.log(`[${reqId}] No matching tokens`);
      await reqRef.delete();
      return;
    }

    // Send FCM
    try {
      const result = await getMessaging().sendEachForMulticast({
        tokens: unique,
        notification: { title, body },
        data: { url: clickUrl },
        webpush: {
          notification: { title, body,
            icon:  `${APP_URL}/favicon.png`,
            badge: `${APP_URL}/favicon.png`,
          },
          fcmOptions: { link: clickUrl },
        },
        android: { priority: 'high', notification: { sound: 'default' } },
      });

      console.log(`[${reqId}] FCM: ${result.successCount} success, ${result.failureCount} failed`);

      // Clean up permanently invalid tokens
      const staleRefs = [];
      result.responses.forEach((resp, i) => {
        if (!resp.success) {
          console.warn(`[${reqId}]   Token[${i}]: ${resp.error?.code}`);
          if (resp.error?.code === 'messaging/registration-token-not-registered' ||
              resp.error?.code === 'messaging/invalid-registration-token') {
            const ref = tokenMap[unique[i]];
            if (ref) staleRefs.push(ref);
          }
        }
      });
      if (staleRefs.length > 0) {
        const batch = db.batch();
        staleRefs.forEach(ref => batch.delete(ref));
        await batch.commit();
        console.log(`[${reqId}] Removed ${staleRefs.length} stale token(s)`);
      }

    } catch (err) {
      console.error(`[${reqId}] FCM error:`, err.message);
    }

    try {
      await reqRef.delete();
      console.log(`[${reqId}] Done.`);
    } catch (err) {
      console.error(`[${reqId}] Delete failed:`, err.message);
    }
  }
);
