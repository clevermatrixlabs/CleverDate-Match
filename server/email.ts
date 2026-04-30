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

export async function sendVerificationCode(toEmail: string, code: string, firstName?: string | null): Promise<SendResult> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn("[email] GMAIL_USER / GMAIL_APP_PASSWORD not configured — code not sent.");
    return { sent: false, reason: "email_not_configured" };
  }

  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f8fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fb;padding:40px 16px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 6px 24px rgba(15,30,80,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#1a237e,#1565c0);padding:32px 24px;text-align:center;color:#ffffff;">
              <div style="font-size:24px;font-weight:700;letter-spacing:-0.5px;">Tim Clever Date</div>
              <div style="font-size:14px;opacity:0.85;margin-top:4px;">One match. One real person.</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px;color:#1a2236;">
              <p style="margin:0 0 16px 0;font-size:16px;">${greeting}</p>
              <p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:#475569;">
                Use the code below to verify your email address. This code expires in <strong>10 minutes</strong>.
              </p>
              <div style="background:#eef3ff;border:1px solid #d6e0ff;border-radius:12px;padding:20px;text-align:center;margin:8px 0 24px 0;">
                <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#1a237e;font-family:'SF Mono',Menlo,Consolas,monospace;">${code}</div>
              </div>
              <p style="margin:0 0 8px 0;font-size:13px;color:#64748b;line-height:1.5;">
                If you didn't request this code, you can safely ignore this email — someone may have typed your address by mistake.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 28px 28px;text-align:center;color:#94a3b8;font-size:12px;">
              © Tim Clever Date · Verified profiles only
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`.trim();

  const text = `${greeting}\n\nYour Tim Clever Date verification code is: ${code}\n\nThis code expires in 10 minutes. If you didn't request it, ignore this email.\n\n— Tim Clever Date`;

  try {
    await transporter.sendMail({
      from: `"Tim Clever Date" <${GMAIL_USER}>`,
      to: toEmail,
      subject: `Your Tim Clever Date verification code: ${code}`,
      text,
      html,
    });
    console.log(`[email] Verification code sent to ${toEmail}`);
    return { sent: true };
  } catch (error: any) {
    console.error(`[email] Failed to send to ${toEmail}:`, error?.message || error);
    return { sent: false, reason: error?.message || "send_failed" };
  }
}

export function isEmailConfigured(): boolean {
  return !!(GMAIL_USER && GMAIL_APP_PASSWORD);
}
