// supabase/functions/send-email/index.ts
// Deploy with: supabase functions deploy send-email

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const FROM_EMAIL = "Ndwandwe Estate <onboarding@resend.dev>"; // Change to your verified Resend domain

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Email Templates ────────────────────────────────────────────────────────

function bookingConfirmedTemplate(data: {
  guestName: string;
  roomNumber: string | number;
  roomType?: string;
  checkIn: string;
  checkOut: string;
  nights?: number;
  totalAmount?: number;
  portalLink?: string;
}): string {
  const { guestName, roomNumber, roomType, checkIn, checkOut, nights, totalAmount, portalLink } = data;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Booking Confirmed — Ndwandwe Estate</title>
</head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#1a1d27;border-radius:16px;overflow:hidden;border:1px solid #2a2d3a;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#6c63ff 0%,#3ecfcf 100%);padding:40px 40px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0 0 8px;color:rgba(255,255,255,0.75);font-size:13px;text-transform:uppercase;letter-spacing:2px;">Ndwandwe Estate</p>
                    <h1 style="margin:0;color:#fff;font-size:28px;font-weight:700;line-height:1.2;">Booking Confirmed! 🎉</h1>
                  </td>
                  <td align="right" style="padding-left:16px;">
                    <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;">🏡</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:32px 40px 0;">
              <p style="margin:0 0 16px;color:#c8cad8;font-size:15px;line-height:1.6;">
                Dear <strong style="color:#ffffff;">${guestName}</strong>,
              </p>
              <p style="margin:0 0 24px;color:#c8cad8;font-size:15px;line-height:1.6;">
                We're delighted to confirm your upcoming stay at <strong style="color:#6c63ff;">Ndwandwe Estate</strong>. Everything is prepared and we look forward to welcoming you.
              </p>
            </td>
          </tr>

          <!-- Booking Summary Card -->
          <tr>
            <td style="padding:0 40px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;border-radius:12px;border:1px solid #2a2d3a;overflow:hidden;">
                <tr>
                  <td style="padding:20px 24px 12px;">
                    <p style="margin:0 0 4px;color:#6c63ff;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Your Reservation</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid #2a2d3a;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="color:#8b8fa8;font-size:13px;">Room</td>
                              <td align="right" style="color:#ffffff;font-size:13px;font-weight:600;">Room ${roomNumber}${roomType ? ` — ${roomType}` : ''}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid #2a2d3a;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="color:#8b8fa8;font-size:13px;">Check-in</td>
                              <td align="right" style="color:#3ecfcf;font-size:13px;font-weight:600;">${formatDate(checkIn)}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid #2a2d3a;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="color:#8b8fa8;font-size:13px;">Check-out</td>
                              <td align="right" style="color:#3ecfcf;font-size:13px;font-weight:600;">${formatDate(checkOut)}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      ${nights ? `
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid #2a2d3a;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="color:#8b8fa8;font-size:13px;">Duration</td>
                              <td align="right" style="color:#ffffff;font-size:13px;font-weight:600;">${nights} Night${nights !== 1 ? 's' : ''}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>` : ''}
                      ${totalAmount ? `
                      <tr>
                        <td style="padding:14px 0 0;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="color:#ffffff;font-size:14px;font-weight:600;">Total</td>
                              <td align="right" style="color:#6c63ff;font-size:18px;font-weight:700;">E${totalAmount.toFixed(2)}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>` : ''}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${portalLink ? `
          <!-- Portal CTA -->
          <tr>
            <td style="padding:0 40px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(108,99,255,0.15),rgba(62,207,207,0.15));border:1px solid rgba(108,99,255,0.3);border-radius:12px;">
                <tr>
                  <td style="padding:24px;">
                    <p style="margin:0 0 8px;color:#ffffff;font-size:14px;font-weight:600;">🔗 Your Guest Portal</p>
                    <p style="margin:0 0 16px;color:#8b8fa8;font-size:13px;line-height:1.6;">
                      Access your personal portal to request services, confirm add-ons, and review your bill anytime during your stay.
                    </p>
                    <a href="${portalLink}" style="display:inline-block;background:linear-gradient(135deg,#6c63ff,#3ecfcf);color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600;letter-spacing:0.3px;">
                      Open My Portal →
                    </a>
                    <p style="margin:16px 0 0;color:#8b8fa8;font-size:11px;line-height:1.6;word-break:break-all;">
                      If the button doesn't work, copy and paste this link: <br>
                      <a href="${portalLink}" style="color:#6c63ff;">${portalLink}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : ''}

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #2a2d3a;">
              <p style="margin:0 0 8px;color:#555870;font-size:12px;line-height:1.6;">
                If you have any questions, please contact us at <a href="mailto:contact@ndwandwe.com" style="color:#6c63ff;text-decoration:none;">contact@ndwandwe.com</a>
              </p>
              <p style="margin:0;color:#555870;font-size:12px;">© 2026 Ndwandwe Estate · Plot 42, Ezulwini, Eswatini</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function invoiceReadyTemplate(data: {
  guestName: string;
  roomNumber: string | number;
  roomType?: string;
  nights: number;
  pricePerNight: number;
  addOns?: Array<{ name: string; quantity: number; price: number }>;
  totalAmount: number;
  paymentMethod: string;
  invoiceId: string;
  checkIn: string;
  checkOut: string;
}): string {
  const { guestName, roomNumber, roomType, nights, pricePerNight, addOns, totalAmount, paymentMethod, invoiceId, checkIn, checkOut } = data;
  const roomTotal = nights * pricePerNight;

  const addOnRows = (addOns && addOns.length > 0)
    ? addOns.map(ao => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #2a2d3a;color:#c8cad8;font-size:13px;">Add-on: ${ao.name} × ${ao.quantity}</td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid #2a2d3a;color:#c8cad8;font-size:13px;">E${(ao.price * ao.quantity).toFixed(2)}</td>
      </tr>`).join('')
    : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Invoice — Ndwandwe Estate</title>
</head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#1a1d27;border-radius:16px;overflow:hidden;border:1px solid #2a2d3a;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a1d27 0%,#2a2d3a 100%);padding:40px 40px 32px;border-bottom:2px solid #6c63ff;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;color:#6c63ff;font-size:11px;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Ndwandwe Estate</p>
                    <h1 style="margin:0;color:#fff;font-size:28px;font-weight:700;">Invoice</h1>
                    <p style="margin:8px 0 0;color:#8b8fa8;font-size:13px;">#${invoiceId} · ${formatDate(new Date().toISOString())}</p>
                  </td>
                  <td align="right">
                    <div style="background:rgba(108,99,255,0.15);border:1px solid rgba(108,99,255,0.3);border-radius:8px;padding:8px 16px;display:inline-block;">
                      <p style="margin:0;color:#6c63ff;font-size:11px;font-weight:600;text-transform:uppercase;">PAID</p>
                      <p style="margin:4px 0 0;color:#ffffff;font-size:20px;font-weight:700;">E${totalAmount.toFixed(2)}</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Guest & Stay Details -->
          <tr>
            <td style="padding:32px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="width:50%;vertical-align:top;padding-right:16px;">
                    <p style="margin:0 0 8px;color:#6c63ff;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Bill To</p>
                    <p style="margin:0 0 4px;color:#ffffff;font-size:15px;font-weight:600;">${guestName}</p>
                    <p style="margin:0;color:#8b8fa8;font-size:13px;">${paymentMethod}</p>
                  </td>
                  <td style="width:50%;vertical-align:top;padding-left:16px;">
                    <p style="margin:0 0 8px;color:#6c63ff;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Stay Details</p>
                    <p style="margin:0 0 4px;color:#ffffff;font-size:14px;font-weight:600;">Room ${roomNumber}${roomType ? ` — ${roomType}` : ''}</p>
                    <p style="margin:0;color:#8b8fa8;font-size:13px;">${formatDate(checkIn)} → ${formatDate(checkOut)}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Line Items -->
          <tr>
            <td style="padding:24px 40px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;border-radius:12px;border:1px solid #2a2d3a;overflow:hidden;">
                <tr style="background:#2a2d3a;">
                  <td style="padding:12px 20px;color:#8b8fa8;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Description</td>
                  <td align="right" style="padding:12px 20px;color:#8b8fa8;font-size:11px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Amount</td>
                </tr>
                <tr>
                  <td style="padding:14px 20px;border-bottom:1px solid #2a2d3a;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid #2a2d3a;color:#c8cad8;font-size:13px;">Room ${roomNumber} — ${nights} night${nights !== 1 ? 's' : ''} × E${pricePerNight}</td>
                        <td align="right" style="padding:10px 0;border-bottom:1px solid #2a2d3a;color:#c8cad8;font-size:13px;">E${roomTotal.toFixed(2)}</td>
                      </tr>
                      ${addOnRows}
                      <tr>
                        <td style="padding:14px 0 0;color:#ffffff;font-size:14px;font-weight:700;">Total Paid</td>
                        <td align="right" style="padding:14px 0 0;color:#6c63ff;font-size:18px;font-weight:700;">E${totalAmount.toFixed(2)}</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Thank You -->
          <tr>
            <td style="padding:0 40px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,rgba(108,99,255,0.1),rgba(62,207,207,0.1));border:1px solid rgba(108,99,255,0.2);border-radius:12px;">
                <tr>
                  <td style="padding:20px 24px;text-align:center;">
                    <p style="margin:0 0 4px;color:#ffffff;font-size:15px;font-weight:600;">Thank you for staying with us!</p>
                    <p style="margin:0;color:#8b8fa8;font-size:13px;">We hope to see you again at Ndwandwe Estate.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #2a2d3a;">
              <p style="margin:0 0 4px;color:#555870;font-size:12px;">Questions? <a href="mailto:contact@ndwandwe.com" style="color:#6c63ff;text-decoration:none;">contact@ndwandwe.com</a></p>
              <p style="margin:0;color:#555870;font-size:12px;">© 2026 Ndwandwe Estate · Plot 42, Ezulwini, Eswatini</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function checkInReceiptTemplate(data: {
  guestName: string;
  roomNumber: string | number;
  roomType?: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  roomCharge: number;
  paymentMethod: string;
  bookingId: string;
}): string {
  const { guestName, roomNumber, roomType, checkIn, checkOut, nights, roomCharge, paymentMethod, bookingId } = data;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Receipt & Confirmation — Ndwandwe Estate</title>
</head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#1a1d27;border-radius:16px;overflow:hidden;border:1px solid #2a2d3a;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:40px 40px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0 0 8px;color:rgba(255,255,255,0.75);font-size:13px;text-transform:uppercase;letter-spacing:2px;">Ndwandwe Estate</p>
                    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;line-height:1.2;">Receipt & Confirmation 🧾</h1>
                  </td>
                  <td align="right" style="padding-left:16px;">
                    <div style="background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.4);border-radius:8px;padding:8px 16px;display:inline-block;text-align:center;">
                      <p style="margin:0;color:#ffffff;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">PAID NOW</p>
                      <p style="margin:4px 0 0;color:#ffffff;font-size:18px;font-weight:700;">E${roomCharge.toFixed(2)}</p>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:32px 40px 0;">
              <p style="margin:0 0 16px;color:#c8cad8;font-size:15px;line-height:1.6;">
                Dear <strong style="color:#ffffff;">${guestName}</strong>,
              </p>
              <p style="margin:0 0 24px;color:#c8cad8;font-size:15px;line-height:1.6;">
                This email confirms that you have checked in and prepaid your room charges. Below is your payment receipt and stay summary.
              </p>
            </td>
          </tr>

          <!-- Stay Details -->
          <tr>
            <td style="padding:0 40px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;border-radius:12px;border:1px solid #2a2d3a;overflow:hidden;">
                <tr>
                  <td style="padding:20px 24px 12px;">
                    <p style="margin:0 0 4px;color:#10b981;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Receipt Summary</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid #2a2d3a;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="color:#8b8fa8;font-size:13px;">Booking Ref</td>
                              <td align="right" style="color:#ffffff;font-size:13px;font-weight:600;">#${bookingId.substring(0, 8).toUpperCase()}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid #2a2d3a;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="color:#8b8fa8;font-size:13px;">Room Stay</td>
                              <td align="right" style="color:#ffffff;font-size:13px;font-weight:600;">Room ${roomNumber}${roomType ? ` — ${roomType}` : ''}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid #2a2d3a;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="color:#8b8fa8;font-size:13px;">Stay Period</td>
                              <td align="right" style="color:#ffffff;font-size:13px;font-weight:600;">${formatDate(checkIn)} to ${formatDate(checkOut)} (${nights} Night${nights !== 1 ? 's' : ''})</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid #2a2d3a;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="color:#8b8fa8;font-size:13px;">Payment Method</td>
                              <td align="right" style="color:#ffffff;font-size:13px;font-weight:600;">${paymentMethod}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:14px 0 0;">
                          <table width="100%" cellpadding="0" cellspacing="0">
                            <tr>
                              <td style="color:#ffffff;font-size:14px;font-weight:600;">Amount Paid</td>
                              <td align="right" style="color:#10b981;font-size:18px;font-weight:700;">E${roomCharge.toFixed(2)}</td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Note -->
          <tr>
            <td style="padding:0 40px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;border-radius:12px;border:1px solid #2a2d3a;padding:20px;">
                <tr>
                  <td style="color:#8b8fa8;font-size:13px;line-height:1.6;text-align:center;">
                    Please note: This is a receipt for your prepaid room charges. Any additional services, meals, or other add-ons requested during your stay will be billed and settled upon check-out.
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #2a2d3a;">
              <p style="margin:0 0 4px;color:#555870;font-size:12px;">Questions? <a href="mailto:contact@ndwandwe.com" style="color:#6c63ff;text-decoration:none;">contact@ndwandwe.com</a></p>
              <p style="margin:0;color:#555870;font-size:12px;">© 2026 Ndwandwe Estate · Plot 42, Ezulwini, Eswatini</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function stayUpdatedTemplate(data: {
  guestName: string;
  roomNumber: string | number;
  updateType: string;
  updateDetails: string;
}): string {
  const { guestName, roomNumber, updateType, updateDetails } = data;
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Stay Update — Ndwandwe Estate</title>
</head>
<body style="margin:0;padding:0;background:#0f1117;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#1a1d27;border-radius:16px;overflow:hidden;border:1px solid #2a2d3a;">
          <tr>
            <td style="background:linear-gradient(135deg,#f59e0b 0%,#d97706 100%);padding:40px 40px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <p style="margin:0 0 8px;color:rgba(255,255,255,0.75);font-size:13px;text-transform:uppercase;letter-spacing:2px;">Ndwandwe Estate</p>
                    <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700;line-height:1.2;">Stay Update Confirmed</h1>
                  </td>
                  <td align="right" style="padding-left:16px;">
                    <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;">📅</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px 0;">
              <p style="margin:0 0 16px;color:#c8cad8;font-size:15px;line-height:1.6;">
                Dear <strong style="color:#ffffff;">${guestName}</strong>,
              </p>
              <p style="margin:0 0 24px;color:#c8cad8;font-size:15px;line-height:1.6;">
                We have updated your reservation for <strong style="color:#ffffff;">Room ${roomNumber}</strong>. Your request for <strong>${updateType}</strong> has been confirmed.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:0 40px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f1117;border-radius:12px;border:1px solid #2a2d3a;overflow:hidden;">
                <tr>
                  <td style="padding:20px 24px 12px;">
                    <p style="margin:0 0 4px;color:#f59e0b;font-size:11px;text-transform:uppercase;letter-spacing:1.5px;font-weight:600;">Update Details</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 20px;">
                    <p style="color:#ffffff;font-size:14px;margin:0;">${updateDetails}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #2a2d3a;">
              <p style="margin:0 0 4px;color:#555870;font-size:12px;">Questions? <a href="mailto:contact@ndwandwe.com" style="color:#6c63ff;text-decoration:none;">contact@ndwandwe.com</a></p>
              <p style="margin:0;color:#555870;font-size:12px;">© 2026 Ndwandwe Estate · Plot 42, Ezulwini, Eswatini</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric"
    });
  } catch {
    return dateStr;
  }
}

// ─── Main Handler ────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { type, to, data } = body;

    if (!to || !type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: 'to' and 'type'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let subject = "";
    let html = "";

    if (type === "booking_confirmed") {
      subject = `✅ Booking Confirmed — Room ${data.roomNumber}, Ndwandwe Estate`;
      html = bookingConfirmedTemplate(data);
    } else if (type === "invoice_ready") {
      subject = `🧾 Your Invoice — Ndwandwe Estate Stay`;
      html = invoiceReadyTemplate(data);
    } else if (type === "checkin_receipt") {
      subject = `🧾 Receipt & Confirmation — Ndwandwe Estate Stay`;
      html = checkInReceiptTemplate(data);
    } else if (type === "stay_updated") {
      subject = `📅 Stay Update Confirmed — Ndwandwe Estate`;
      html = stayUpdatedTemplate(data);
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown email type: ${type}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendPayload = {
      from: FROM_EMAIL,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    };

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendPayload),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error("Resend API error:", resendData);
      return new Response(
        JSON.stringify({ error: "Resend API error", details: resendData }),
        { status: resendRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, id: resendData.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
