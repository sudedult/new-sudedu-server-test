import { google } from "googleapis";
import { Buffer } from "buffer";

const oAuth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);

oAuth2Client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });

export async function sendEmail(to, subject, html) {
  try {
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    // Encode subject to UTF-8 for Gmail
    const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString("base64")}?=`;

    const messageParts = [
      `From: ${process.env.EMAIL_SENDER}`,
      `To: ${to}`,
      `Subject: ${encodedSubject}`,
      "Content-Type: text/html; charset=UTF-8",
      "",
      html,
    ];

    const message = messageParts.join("\n");
    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: encodedMessage },
    });

    console.log(`✅ Email sent to ${to}`);
  } catch (err) {
    console.error("❌ Email send failed:", err);
  }
}
