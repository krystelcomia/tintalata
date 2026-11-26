import crypto from 'node:crypto';
import nodemailer from 'nodemailer';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function resolveAppBaseUrl(req) {
  const configured = String(process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;

  const origin = String(req?.headers?.origin || '').trim().replace(/\/+$/, '');
  if (origin && /^https?:\/\//i.test(origin)) {
    return origin;
  }

  const forwardedHost = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '')
    .split(',')[0]
    .trim();
  const forwardedProto =
    String(req?.headers?.['x-forwarded-proto'] || 'https')
      .split(',')[0]
      .trim() || 'https';
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const vercelProd = String(process.env.VERCEL_PROJECT_PRODUCTION_URL || '').trim();
  if (vercelProd) {
    return `https://${vercelProd.replace(/^https?:\/\//, '')}`;
  }

  return 'http://localhost:5173';
}

export function buildResetApprovedEmail({
  fullName,
  referenceNumber,
  resetUrl,
  expiresMinutes = 15,
}) {
  const safeName = escapeHtml(fullName);
  const safeRef = escapeHtml(referenceNumber);
  const safeUrl = escapeHtml(resetUrl);

  const subject = `[Tintalata] Naaprubahan ang Iyong Password Reset Request (${referenceNumber})`;
  const text = [
    `Kumusta ${fullName},`,
    '',
    `Naaprubahan ng Tagapangasiwa (Admin) ang iyong kahilingan sa pag-reset ng password (Reference: ${referenceNumber}).`,
    '',
    `Gamitin ang one-time secure link sa ibaba upang makagawa ng bagong password. Mawawalan ito ng bisa pagkalipas ng ${expiresMinutes} minuto:`,
    resetUrl,
    '',
    'Mga Tagubilin:',
    '1. Buksan ang link sa itaas sa loob ng 15 minuto.',
    '2. Maglagay ng malakas na bagong password (hindi bababa sa 8 karakter na may titik at numero) at kumpirmahin ito.',
    '3. Pagkatapos mapalitan, mag-log in gamit ang iyong bagong password.',
    '',
    'Kung hindi ikaw ang humiling nito, makipag-ugnayan agad sa Tagapangasiwa ng Tintalata.',
  ].join('\n');

  const html = `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f8ff;padding:24px;border-radius:16px;border:1px solid #dbeafe;color:#0f172a;">
    <div style="background:#ffffff;border-radius:12px;padding:24px;border:1px solid #bfdbfe;">
      <h2 style="margin:0 0 8px;color:#1e3a8a;font-size:20px;">Naaprubahan ang Password Reset</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:13px;">Reference Number: <strong>${safeRef}</strong></p>
      <p style="font-size:14px;line-height:1.6;">Kumusta <strong>${safeName}</strong>,</p>
      <p style="font-size:14px;line-height:1.6;">
        Naaprubahan na ng Tagapangasiwa ng <strong>Tintalata</strong> ang iyong kahilingan na mag-reset ng password.
      </p>
      <p style="font-size:14px;line-height:1.6;">
        Pindutin ang pindutan sa ibaba upang itakda ang iyong bagong password. Ang link na ito ay para sa <strong>isang gamit lamang</strong> at mag-e-expire pagkalipas ng <strong>${expiresMinutes} minuto</strong>:
      </p>
      <div style="margin:24px 0;text-align:center;">
        <a href="${safeUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 24px;border-radius:10px;font-size:14px;">
          Magtakda ng Bagong Password
        </a>
      </div>
      <p style="font-size:12px;color:#64748b;word-break:break-all;">
        Kung hindi gumana ang pindutan, kopyahin at ilagay ang link na ito sa iyong browser:<br/>
        <a href="${safeUrl}" style="color:#1d4ed8;">${safeUrl}</a>
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />
      <p style="font-size:12px;color:#475569;line-height:1.6;margin:0;">
        <strong>Mga Tagubilin:</strong> Pumili ng password na may hindi bababa sa 8 karakter at may pinagsamang titik at numero. Mawawalan ng bisa ang link pagkatapos gamitin o pagkalipas ng 15 minuto.
      </p>
    </div>
  </div>`;

  return { subject, text, html };
}

export function buildResetRejectedEmail({ fullName, referenceNumber, reason, statusUrl }) {
  const safeName = escapeHtml(fullName);
  const safeRef = escapeHtml(referenceNumber);
  const safeReason = escapeHtml(reason);
  const safeStatusUrl = escapeHtml(statusUrl);

  const subject = `[Tintalata] Tinanggihan ang Password Reset Request (${referenceNumber})`;
  const text = [
    `Kumusta ${fullName},`,
    '',
    `Tinanggihan ng Tagapangasiwa (Admin) ang iyong kahilingan sa pag-reset ng password (${referenceNumber}).`,
    '',
    `Dahilan mula sa Admin: ${reason}`,
    '',
    'Kung kinakailangan mo pa ring mag-reset ng password, maaari kang magpadala ng panibagong kahilingan na may kumpleto at wastong impormasyon o makipag-ugnayan sa iyong Tagapangasiwa.',
    statusUrl ? `Maaari mo ring suriin ang status sa: ${statusUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const html = `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f8ff;padding:24px;border-radius:16px;border:1px solid #dbeafe;color:#0f172a;">
    <div style="background:#ffffff;border-radius:12px;padding:24px;border:1px solid #fecdd3;">
      <h2 style="margin:0 0 8px;color:#9f1239;font-size:20px;">Hindi Naaprubahan ang Password Reset</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:13px;">Reference Number: <strong>${safeRef}</strong></p>
      <p style="font-size:14px;line-height:1.6;">Kumusta <strong>${safeName}</strong>,</p>
      <p style="font-size:14px;line-height:1.6;">
        Ikinalulungkot naming ipaalam na tinanggihan ng Tagapangasiwa ang iyong kahilingan sa pag-reset ng password.
      </p>
      <div style="margin:16px 0;padding:14px;border-radius:10px;background:#fff1f2;border:1px solid #fecdd3;">
        <p style="margin:0;font-size:12px;font-weight:700;color:#9f1239;text-transform:uppercase;">Dahilan ng Admin:</p>
        <p style="margin:6px 0 0;font-size:14px;color:#881337;">${safeReason}</p>
      </div>
      <p style="font-size:13px;color:#475569;line-height:1.6;">
        Kung kinakailangan pa rin, maaari kang magsumite ng bagong kahilingan sa pahina ng <strong>Nakalimutan ang Password</strong> gamit ang kumpleto at beripikadong impormasyon ng mag-aaral.
      </p>
      ${
        safeStatusUrl
          ? `<p style="font-size:12px;color:#64748b;">Status tracking link: <a href="${safeStatusUrl}" style="color:#1d4ed8;">${safeStatusUrl}</a></p>`
          : ''
      }
    </div>
  </div>`;

  return { subject, text, html };
}

export function buildPasswordChangedEmail({ fullName, referenceNumber }) {
  const safeName = escapeHtml(fullName);
  const safeRef = escapeHtml(referenceNumber);

  const subject = '[Tintalata] Matagumpay na Napalitan ang Iyong Password';
  const text = [
    `Kumusta ${fullName},`,
    '',
    `Kumpirmasyon ito na matagumpay nang napalitan ang password ng iyong Tintalata account${referenceNumber ? ` (Reference: ${referenceNumber})` : ''}.`,
    '',
    'Para sa iyong seguridad, hindi isinama sa email na ito ang iyong bagong password.',
    'Maaari ka nang mag-log in gamit ang iyong bagong password. Kung hindi ikaw ang nagsagawa ng pagbabagong ito, makipag-ugnayan agad sa Tagapangasiwa.',
  ].join('\n');

  const html = `
  <div style="font-family:Segoe UI,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f4f8ff;padding:24px;border-radius:16px;border:1px solid #dbeafe;color:#0f172a;">
    <div style="background:#ffffff;border-radius:12px;padding:24px;border:1px solid #bbf7d0;">
      <h2 style="margin:0 0 8px;color:#166534;font-size:20px;">Matagumpay na Napalitan ang Password</h2>
      ${safeRef ? `<p style="margin:0 0 16px;color:#475569;font-size:13px;">Reference Number: <strong>${safeRef}</strong></p>` : ''}
      <p style="font-size:14px;line-height:1.6;">Kumusta <strong>${safeName}</strong>,</p>
      <p style="font-size:14px;line-height:1.6;">
        Matagumpay nang na-update ang password ng iyong account sa <strong>Tintalata</strong>.
      </p>
      <p style="font-size:13px;color:#475569;line-height:1.6;">
        Para sa iyong seguridad, hindi nakalagay sa email na ito ang iyong bagong password. Maaari ka nang mag-log in ngayon gamit ang itinakda mong password.
      </p>
      <p style="font-size:12px;color:#64748b;margin-top:16px;">
        Kung hindi ikaw ang gumawa ng pagbabagong ito, ipagbigay-alam agad sa Tagapangasiwa.
      </p>
    </div>
  </div>`;

  return { subject, text, html };
}

async function deliverThroughConfiguredProvider({ to, subject, html, text }, db) {
  // Explicit injected transport for automated verification tests
  if (db?.emailTransport && typeof db.emailTransport.send === 'function') {
    const res = await db.emailTransport.send({ to, subject, html, text });
    if (!res?.messageId) {
      throw new Error('Walang messageId mula sa email transport.');
    }
    return { provider: res.provider || 'custom-transport', messageId: String(res.messageId) };
  }

  const resendKey = String(process.env.RESEND_API_KEY || '').trim();
  const smtpFrom = String(
    process.env.EMAIL_FROM ||
      process.env.SMTP_FROM ||
      process.env.GMAIL_USER ||
      process.env.SMTP_USER ||
      'Tintalata <onboarding@resend.dev>'
  ).trim();

  if (resendKey) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: smtpFrom,
        to: [to],
        subject,
        html,
        text,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.id) {
      throw new Error(body?.message || body?.error || `Resend HTTP ${response.status}`);
    }
    return { provider: 'resend', messageId: String(body.id) };
  }

  const gmailUser = String(process.env.GMAIL_USER || '').trim();
  const gmailPass = String(process.env.GMAIL_APP_PASSWORD || '').trim();
  const smtpHost = String(process.env.SMTP_HOST || '').trim();
  const smtpUser = String(process.env.SMTP_USER || '').trim();
  const smtpPass = String(process.env.SMTP_PASS || '').trim();

  if (gmailUser && gmailPass) {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: gmailUser, pass: gmailPass },
    });
    const info = await transporter.sendMail({
      from: String(process.env.EMAIL_FROM || process.env.SMTP_FROM || `Tintalata <${gmailUser}>`),
      to,
      subject,
      html,
      text,
    });
    if (Array.isArray(info.rejected) && info.rejected.length > 0) {
      throw new Error(`Tinanggihan ng email server ang tatanggap: ${info.rejected.join(', ')}`);
    }
    if (!info.messageId) {
      throw new Error('Hindi nagbalik ng messageId ang SMTP server.');
    }
    return { provider: 'gmail-smtp', messageId: String(info.messageId) };
  }

  if (smtpHost && smtpUser && smtpPass) {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure =
      String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port,
      secure,
      auth: { user: smtpUser, pass: smtpPass },
    });
    const info = await transporter.sendMail({
      from: String(process.env.EMAIL_FROM || process.env.SMTP_FROM || `Tintalata <${smtpUser}>`),
      to,
      subject,
      html,
      text,
    });
    if (Array.isArray(info.rejected) && info.rejected.length > 0) {
      throw new Error(`Tinanggihan ng SMTP server ang tatanggap: ${info.rejected.join(', ')}`);
    }
    if (!info.messageId) {
      throw new Error('Hindi nagbalik ng messageId ang SMTP server.');
    }
    return { provider: 'smtp', messageId: String(info.messageId) };
  }

  throw new Error(
    'Walang naka-configure na email delivery service (magtakda ng RESEND_API_KEY, GMAIL_USER + GMAIL_APP_PASSWORD, o SMTP_HOST/SMTP_USER/SMTP_PASS).'
  );
}

export async function sendTransactionalEmail(
  db,
  { userId = null, resetRequestId = null, recipientEmail, emailType, subject, html, text }
) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await db.run(
    `INSERT INTO email_notifications (
      id, user_id, reset_request_id, recipient_email, email_type, subject, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    id,
    userId,
    resetRequestId,
    recipientEmail,
    emailType,
    subject,
    createdAt
  );

  try {
    const { provider, messageId } = await deliverThroughConfiguredProvider(
      { to: recipientEmail, subject, html, text },
      db
    );
    const sentAt = new Date().toISOString();
    await db.run(
      `UPDATE email_notifications
       SET status = 'sent', provider = ?, provider_message_id = ?, sent_at = ?
       WHERE id = ?`,
      provider,
      messageId,
      sentAt,
      id
    );
    return {
      ok: true,
      sent: true,
      status: 'sent',
      id,
      provider,
      messageId,
      sentAt,
      error: null,
    };
  } catch (err) {
    const errMsg = String(err?.message || 'Nabigo ang pagpapadala ng email.').slice(0, 500);
    await db.run(
      `UPDATE email_notifications
       SET status = 'failed', provider = ?, error_message = ?
       WHERE id = ?`,
      process.env.RESEND_API_KEY
        ? 'resend'
        : process.env.GMAIL_USER
          ? 'gmail-smtp'
          : process.env.SMTP_HOST
            ? 'smtp'
            : 'unconfigured',
      errMsg,
      id
    );
    return {
      ok: false,
      sent: false,
      status: 'failed',
      id,
      provider: 'failed',
      messageId: null,
      sentAt: null,
      error: errMsg,
    };
  }
}
