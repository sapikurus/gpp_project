/**
 * GPP Portal — Firebase Cloud Function
 * Triggered when a document is created in `notification_requests`
 * Reads FCM tokens → sends push → deletes request
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp }     = require('firebase-admin/app');
const { getMessaging }      = require('firebase-admin/messaging');
const { getFirestore }      = require('firebase-admin/firestore');

initializeApp();

const APP_URL = 'https://gpp.globalpetro.co.id'; // full URL for click actions

exports.sendApprovalPush = onDocumentCreated(
  'notification_requests/{reqId}',
  async (event) => {
    const req = event.data?.data();
    if (!req?.title) {
      console.log('Skipped: document has no title field');
      return;
    }

    const db     = getFirestore();
    const reqRef = event.data.ref;
    const reqId  = event.params.reqId;

    const { title, body, url = '/', targetRoles = [] } = req;
    const clickUrl = url.startsWith('http') ? url : `${APP_URL}${url}`;

    console.log(`Processing [${reqId}]: "${title}" → targetRoles: [${targetRoles.join(', ') || 'all'}]`);

    // ── Read all FCM tokens ────────────────────────────────────────────────────
    let tokensSnap;
    try {
      tokensSnap = await db.collection('fcm_tokens').get();
    } catch (err) {
      console.error('Failed to read fcm_tokens:', err.message);
      await reqRef.delete();
      return;
    }

    console.log(`Found ${tokensSnap.size} registered device(s)`);

    // ── Match tokens by role ───────────────────────────────────────────────────
    const tokens   = [];
    const tokenMap = {}; // token → doc ref (for stale cleanup)
    tokensSnap.forEach(d => {
      const data = d.data();
      if (!data.token) return;
      const role = data.role || 'staff';
      const match = targetRoles.length === 0
        || targetRoles.includes(role)
        || role === 'superadmin'
        || role === 'director';
      if (match) {
        tokens.push(data.token);
        tokenMap[data.token] = d.ref;
        console.log(`  ✓ ${data.email} (${role})`);
      } else {
        console.log(`  ✗ ${data.email} (${role}) — role not in targetRoles`);
      }
    });

    const unique = [...new Set(tokens)];
    if (unique.length === 0) {
      console.log('No matching tokens — deleting request and exiting');
      await reqRef.delete();
      return;
    }

    console.log(`Sending FCM to ${unique.length} device(s)...`);

    // ── Send FCM multicast ─────────────────────────────────────────────────────
    let successCount = 0, failureCount = 0;
    try {
      const result = await getMessaging().sendEachForMulticast({
        tokens: unique,
        notification: { title, body },
        data: { url: clickUrl },  // must be full URL
        webpush: {
          notification: {
            title,
            body,
            icon:  `${APP_URL}/favicon.png`,
            badge: `${APP_URL}/favicon.png`,
            requireInteraction: false,
          },
          fcmOptions: { link: clickUrl },  // full URL for click action
        },
        android: {
          priority: 'high',
          notification: { sound: 'default' },
        },
      });

      successCount = result.successCount;
      failureCount = result.failureCount;
      console.log(`FCM result: ${successCount} success, ${failureCount} failed`);

      // Log individual failures and collect stale tokens
      const staleRefs = [];
      result.responses.forEach((resp, i) => {
        if (!resp.success) {
          console.warn(`  Token[${i}] failed: ${resp.error?.code} — ${resp.error?.message}`);
          if (
            resp.error?.code === 'messaging/registration-token-not-registered' ||
            resp.error?.code === 'messaging/invalid-registration-token'
          ) {
            const ref = tokenMap[unique[i]];
            if (ref) staleRefs.push(ref);
          }
        }
      });

      // Clean up stale tokens
      if (staleRefs.length > 0) {
        console.log(`Removing ${staleRefs.length} stale token(s) from Firestore`);
        const batch = db.batch();
        staleRefs.forEach(ref => batch.delete(ref));
        await batch.commit();
      }

    } catch (err) {
      console.error('FCM sendEachForMulticast error:', err.message, err.code || '');
    }

    // Always delete the request document
    try {
      await reqRef.delete();
      console.log(`Request [${reqId}] deleted. Done.`);
    } catch (err) {
      console.error('Failed to delete request doc:', err.message);
    }
  }
);
