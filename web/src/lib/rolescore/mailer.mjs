// Magic-link delivery. Real email when Gmail SMTP creds are configured;
// otherwise falls back to logging the link server-side so local development
// and testing before the app password exists don't hard-fail — but that
// fallback is NOT secure for real users (anyone with log/console access gets
// the link), and is clearly labeled as such everywhere it fires.
import nodemailer from "nodemailer";

let transporter;

function getTransporter() {
  if (transporter !== undefined) return transporter;
  const user = process.env.ROLESCORE_SMTP_USER;
  const pass = process.env.ROLESCORE_SMTP_PASS;
  if (!user || !pass) {
    transporter = null;
    return transporter;
  }
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return transporter;
}

export function isEmailConfigured() {
  return Boolean(getTransporter());
}

export async function sendMagicLink(email, link) {
  const t = getTransporter();
  const from = process.env.ROLESCORE_SMTP_FROM || process.env.ROLESCORE_SMTP_USER;

  if (!t) {
    // DEV FALLBACK ONLY — see module comment. Never rely on this for a real
    // user; it's here so the rest of the auth flow is buildable and testable
    // before Gmail SMTP creds are supplied.
    console.warn(
      `[rolescore] ROLESCORE_SMTP_USER/PASS not set — magic link for ${email} was NOT emailed, only logged:\n  ${link}`,
    );
    return { sent: false, devLink: link };
  }

  await t.sendMail({
    from: from ? `RoleScore <${from}>` : undefined,
    to: email,
    subject: "Your RoleScore sign-in link",
    text: `Sign in to RoleScore:\n\n${link}\n\nThis link expires in 15 minutes. If you didn't request it, ignore this email.`,
    html: `<p>Sign in to RoleScore:</p><p><a href="${link}">${link}</a></p><p>This link expires in 15 minutes. If you didn't request it, ignore this email.</p>`,
  });
  return { sent: true };
}
