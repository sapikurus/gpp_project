/**
 * GPP Portal — Google Apps Script Email Proxy
 * 
 * HOW TO USE:
 * 1. Go to https://script.google.com
 * 2. Create a new project (name it "GPP Email Proxy" or similar)
 * 3. Delete all existing code and paste this entire file
 * 4. Click Deploy → New deployment
 * 5. Type: Web App
 * 6. Execute as: Me (your Google account)
 * 7. Who has access: Anyone
 * 8. Click Deploy → Copy the Web App URL
 * 9. Paste that URL into the app: Master Data → Settings → Email Notification Endpoint
 *
 * The email will be sent FROM your Google account (the one that owns this script).
 *
 * SECURITY NOTE: The URL acts as a secret — anyone who has it can send email
 * from your account. Keep it private and do not commit it to GitHub.
 */

function doGet(e) {
  try {
    var params = e.parameter;

    // ── Email action ──────────────────────────────────────────────────────────
    if (params.action === 'email') {
      var to      = params.to      || '';
      var subject = params.subject || 'GPP Portal Notification';
      var body    = params.body    || '';

      if (!to.trim()) {
        return json({ success: false, error: 'No recipient address provided.' });
      }

      // Support comma-separated list of recipients
      var recipients = to.split(',').map(function(s) { return s.trim(); }).filter(Boolean);

      MailApp.sendEmail({
        to:      recipients.join(','),
        subject: subject,
        body:    body,
        // Optional: add a simple HTML wrapper for better email rendering
        htmlBody: '<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#374151">'
                + '<div style="background:#1e3a8a;padding:16px 24px;border-radius:8px 8px 0 0">'
                + '<h2 style="color:white;margin:0;font-size:16px">GPP Portal</h2>'
                + '</div>'
                + '<div style="background:#f9fafb;padding:20px 24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">'
                + '<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px">' + body + '</pre>'
                + '</div>'
                + '<p style="font-size:11px;color:#9ca3af;margin-top:12px">Sent by GPP Portal — PT Global Petro Pasifik</p>'
                + '</div>',
      });

      return json({ success: true, recipients: recipients.length });
    }

    // ── Health check (for testing the endpoint is alive) ──────────────────────
    if (params.action === 'ping') {
      return json({ success: true, message: 'GPP Email Proxy is running.' });
    }

    return json({ success: false, error: 'Unknown action: ' + (params.action || 'none') });

  } catch (err) {
    return json({ success: false, error: err.toString() });
  }
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
