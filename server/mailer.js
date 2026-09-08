// Outgoing email. Everything is configured from the environment (.env), nothing else.
//
//   SMTP_HOST      smtp.mail.ovh.net for OVH mailboxes (ssl0.ovh.net also works)
//   SMTP_PORT      465 (TLS from the first byte) or 587 (STARTTLS)
//   SMTP_SECURE    true for 465; inferred from the port when unset
//   SMTP_USER      the full mailbox address, e.g. noreply@badmavasan.tech
//   SMTP_PASSWORD  its password (SMTP_PASS is accepted as an alias)
//   MAIL_FROM      what recipients see; the address must match SMTP_USER on OVH
//
// With SMTP_HOST or SMTP_PASSWORD missing nothing is sent: links are written to
// the server log and, for invites, shown to the campaign owner in the UI instead.
import nodemailer from 'nodemailer';

export const mail = {
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT || 465),
  secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE.toLowerCase() === 'true' : (process.env.SMTP_PORT || '465') === '465',
  user: process.env.SMTP_USER || '',
  password: process.env.SMTP_PASSWORD || process.env.SMTP_PASS || '',
  from: process.env.MAIL_FROM || (process.env.SMTP_USER ? `Concord <${process.env.SMTP_USER}>` : 'Concord <noreply@localhost>'),
};
export const mailEnabled = Boolean(mail.host && mail.user && mail.password);
export const LINK_TTL_MS = Math.max(1, Number(process.env.LINK_TTL_HOURS || 24)) * 3600 * 1000;

let transport = null;
export function transporter() {
  if (!transport) transport = nodemailer.createTransport({ host: mail.host, port: mail.port, secure: mail.secure, auth: { user: mail.user, pass: mail.password } });
  return transport;
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ttlText = () => { const h = Math.round(LINK_TTL_MS / 3600000); return h === 1 ? '1 hour' : `${h} hours`; };

// One layout for every message, in Concord's own look: paper background, ink text, serif heading, a highlighter mark.
function layout({ heading, paragraphs, cta, footnote }) {
  const ps = paragraphs.map(p => `<p style="margin:0 0 14px">${p}</p>`).join('');
  const button = cta ? `<p style="margin:22px 0"><a href="${esc(cta.href)}" style="display:inline-block;background:#f3e14b;color:#151f1b;text-decoration:none;font-weight:600;padding:11px 18px;border-radius:6px">${esc(cta.label)}</a></p>
  <p style="margin:0 0 14px;font-size:13px;color:#5e6a64">If the button does not work, copy this address into your browser:<br><a href="${esc(cta.href)}" style="color:#1f5b48;word-break:break-all">${esc(cta.href)}</a></p>` : '';
  return `<div style="background:#f5f6f3;padding:32px 16px;font-family:'Source Sans 3','Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#151f1b">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #d9ded9;border-radius:10px;padding:28px 32px">
    <div style="font-family:Georgia,'Source Serif 4',serif;font-size:20px;margin-bottom:22px"><span style="display:inline-block;width:22px;height:10px;background:#f3e14b;vertical-align:middle;margin-right:8px"></span>Concord</div>
    <h1 style="font-family:Georgia,'Source Serif 4',serif;font-weight:500;font-size:24px;line-height:1.25;margin:0 0 16px">${heading}</h1>
    ${ps}${button}
    ${footnote ? `<p style="margin:18px 0 0;font-size:13px;color:#5e6a64;border-top:1px solid #d9ded9;padding-top:14px">${footnote}</p>` : ''}
  </div>
</div>`;
}

async function deliver({ to, subject, heading, paragraphs, cta, footnote, textLines }) {
  const text = textLines.join('\n');
  if (!mailEnabled) { console.warn(`[mail] Not configured, so nothing was sent to ${to}. ${cta ? 'Link: ' + cta.href : ''}`); return false; }
  try {
    await transporter().sendMail({ from: mail.from, to, subject, text, html: layout({ heading, paragraphs, cta, footnote }) });
    return true;
  } catch (err) { console.error('[mail] Could not send:', err.message); return false; }
}

export function sendInvite({ to, inviterName, campaignName, link }) {
  return deliver({
    to, subject: `${inviterName} invited you to review "${campaignName}"`,
    heading: `${esc(inviterName)} invited you to <mark style="background:#f3e14b;padding:0 .1em">${esc(campaignName)}</mark>`,
    paragraphs: [`You have been asked to annotate papers for the systematic review <strong>${esc(campaignName)}</strong> on Concord.`, `Open the link below to choose a password. It works once and stops working after ${ttlText()}; if it has expired, ask ${esc(inviterName)} to send a new one.`],
    cta: { href: link, label: 'Choose a password and join' },
    footnote: 'You received this because someone entered your address on Concord. If you were not expecting it, you can ignore this message.',
    textLines: [`${inviterName} invited you to annotate papers for the systematic review "${campaignName}" on Concord.`, '', `Choose a password and join: ${link}`, '', `The link works once and stops working after ${ttlText()}. If it has expired, ask ${inviterName} to send a new one.`],
  });
}

export function sendAddedToCampaign({ to, name, inviterName, campaignName, link }) {
  return deliver({
    to, subject: `You were added to "${campaignName}"`,
    heading: `You are now on <mark style="background:#f3e14b;padding:0 .1em">${esc(campaignName)}</mark>`,
    paragraphs: [`Hello ${esc(name)},`, `${esc(inviterName)} added you to the systematic review <strong>${esc(campaignName)}</strong>. Sign in with your usual password to see the papers assigned to you.`],
    cta: { href: link, label: 'Open the campaign' },
    textLines: [`Hello ${name},`, '', `${inviterName} added you to the systematic review "${campaignName}" on Concord.`, '', `Open it: ${link}`],
  });
}

export function sendPasswordReset({ to, name, link }) {
  return deliver({
    to, subject: 'Reset your Concord password',
    heading: 'Choose a new password',
    paragraphs: [`Hello ${esc(name)},`, `Someone asked to reset the password of your Concord account. If that was you, open the link below and pick a new one.`, `The link works once and stops working after ${ttlText()}.`],
    cta: { href: link, label: 'Choose a new password' },
    footnote: 'If this was not you, ignore this message. Nothing has changed.',
    textLines: [`Hello ${name},`, '', 'Someone asked to reset the password of your Concord account. If that was you, open this link and pick a new one:', '', link, '', `The link works once and stops working after ${ttlText()}.`, '', 'If this was not you, ignore this message. Nothing has changed.'],
  });
}
