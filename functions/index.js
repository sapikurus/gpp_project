/**
 * GPP Portal — Firebase Cloud Function (v1 syntax)
 * Uses Pub/Sub trigger instead of Eventarc — no IAM setup needed.
 * Triggered when a document is created in `notification_requests`.
 */

const functions  = require('firebase-functions/v1');
const { initializeApp }  = require('firebase-admin/app');
const { getMessaging }   = require('firebase-admin/messaging');
const { getFirestore }   = require('firebase-admin/firestore');

initializeApp();

const APP_URL = 'https://gpp.globalpetro.co.id';

exports.sendApprovalPush = functions
  .region('asia-southeast1')
  .firestore
  .document('notification_requests/{reqId}')
  .onCreate(async (snap, context) => {
    const req   = snap.data();
    const reqId = context.params.reqId;

    if (!req?.title) {
      console.log(`[${reqId}] Skipped — no title field`);
      return null;
    }

    const db     = getFirestore();
    const reqRef = snap.ref;
    const { title, body, url = '/', targetRoles = [] } = req;
    const clickUrl = url.startsWith('http') ? url : `${APP_URL}${url}`;

    console.log(`[${reqId}] "${title}" → targetRoles: [${targetRoles.join(', ') || 'ALL'}]`);

    // ── Read all FCM tokens ────────────────────────────────────────────────────
    let tokensSnap;
    try {
      tokensSnap = await db.collection('fcm_tokens').get();
    } catch (err) {
      console.error(`[${reqId}] Failed to read fcm_tokens:`, err.message);
      await reqRef.delete();
      return null;
    }

    console.log(`[${reqId}] Found ${tokensSnap.size} registered device(s)`);

    // ── Match tokens by role ───────────────────────────────────────────────────
    const tokens   = [];
    const tokenMap = {};
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
        console.log(`[${reqId}]   ✓ ${data.email} (${role})`);
      } else {
        console.log(`[${reqId}]   ✗ ${data.email} (${role}) — not in targetRoles`);
      }
    });

    const unique = [...new Set(tokens)];
    if (unique.length === 0) {
      console.log(`[${reqId}] No matching tokens — done`);
      await reqRef.delete();
      return null;
    }

    console.log(`[${reqId}] Sending FCM to ${unique.length} device(s)...`);

    // ── Send FCM ───────────────────────────────────────────────────────────────
    try {
      const result = await getMessaging().sendEachForMulticast({
        tokens: unique,
        notification: { title, body },
        data: { url: clickUrl },
        webpush: {
          notification: {
            title,
            body,
            icon:  `${APP_URL}/favicon.png`,
            badge: `${APP_URL}/favicon.png`,
            requireInteraction: false,
          },
          fcmOptions: { link: clickUrl },
        },
        android: {
          priority: 'high',
          notification: { sound: 'default' },
        },
      });

      console.log(`[${reqId}] FCM: ${result.successCount} success, ${result.failureCount} failed`);

      // Clean up stale tokens
      const staleRefs = [];
      result.responses.forEach((resp, i) => {
        if (!resp.success) {
          console.warn(`[${reqId}]   Token[${i}] error: ${resp.error?.code}`);
          if (
            resp.error?.code === 'messaging/registration-token-not-registered' ||
            resp.error?.code === 'messaging/invalid-registration-token'
          ) {
            const ref = tokenMap[unique[i]];
            if (ref) staleRefs.push(ref);
          }
        }
      });

      if (staleRefs.length > 0) {
        console.log(`[${reqId}] Removing ${staleRefs.length} stale token(s)`);
        const batch = db.batch();
        staleRefs.forEach(ref => batch.delete(ref));
        await batch.commit();
      }

    } catch (err) {
      console.error(`[${reqId}] FCM error:`, err.message);
    }

    // Always delete the request doc
    try {
      await reqRef.delete();
      console.log(`[${reqId}] Done.`);
    } catch (err) {
      console.error(`[${reqId}] Failed to delete request:`, err.message);
    }

    return null;
  });
