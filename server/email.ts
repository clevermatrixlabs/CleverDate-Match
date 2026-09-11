import nodemailer from "nodemailer";

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) return null;
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
  });
  return cachedTransporter;
}

export interface SendResult {
  sent: boolean;
  reason?: string;
}

export async function sendAdminNotification(subject: string, body: string): Promise<SendResult> {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.warn("[email] ADMIN_EMAIL not set — admin notification not sent.");
    return { sent: false, reason: "admin_email_not_configured" };
  }
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("[email] Email transporter not configured — admin notification not sent.");
    return { sent: false, reason: "email_not_configured" };
  }
  const html = `
<!doctype html><html><body style="font-family:-apple-system,sans-serif;background:#f6f8fb;padding:32px 16px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
    <div style="background:linear-gradient(135deg,#1a237e,#1565c0);padding:24px;color:#fff;">
      <strong style="font-size:18px;">Clever Date Match — Admin Alert</strong>
    </div>
    <div style="padding:24px;color:#1a2236;white-space:pre-wrap;line-height:1.6;">${body.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
    <div style="padding:12px 24px 20px;font-size:12px;color:#94a3b8;">Sent automatically by Clever Date Match platform</div>
  </div>
</body></html>`.trim();
  try {
    await transporter.sendMail({
      from: `"Clever Date Match" <${GMAIL_USER}>`,
      to: adminEmail,
      subject: `[Clever Date Match Admin] ${subject}`,
      text: body,
      html,
    });
    console.log(`[email] Admin notification sent: ${subject}`);
    return { sent: true };
  } catch (error: any) {
    console.error("[email] Admin notification failed:", error?.message);
    return { sent: false, reason: error?.message || "send_failed" };
  }
}
