import nodemailer from 'nodemailer';

let transport = null;
if (process.env.SMTP_HOST) {
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

export const mailEnabled = !!transport;

export async function sendInvite({ to, inviterName, campaignName, link }) {
  if (!transport) return false;
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: `${inviterName} invited you to review "${campaignName}" on Concord`,
    text: `${inviterName} invited you to join the systematic review campaign "${campaignName}".\n\nAccept the invite: ${link}\n`,
  });
  return true;
}
