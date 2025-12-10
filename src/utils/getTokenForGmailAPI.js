import { google } from "googleapis";
import readline from "readline";
import 'dotenv/config'; // Make sure dotenv is installed

// Create OAuth2 client
const oAuth2Client = new google.auth.OAuth2(
  process.env.GMAIL_CLIENT_ID,
  process.env.GMAIL_CLIENT_SECRET,
  process.env.GMAIL_REDIRECT_URI
);

// Gmail send scope
const SCOPES = ['https://www.googleapis.com/auth/gmail.send'];

// Generate authorization URL
const authUrl = oAuth2Client.generateAuthUrl({
  access_type: 'offline', // Important to get refresh token
  scope: SCOPES,
  prompt: 'consent'       // Force consent to always get refresh token
});

console.log('1️⃣ Visit this URL to authorize the app:\n', authUrl);

// Read authorization code from user
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question('2️⃣ Enter the code from that page here: ', async (code) => {
  rl.close();
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    console.log('✅ New tokens generated:');
    console.log(tokens);
    console.log('\n💡 Save the refresh_token in your .env as GMAIL_REFRESH_TOKEN');
  } catch (err) {
    console.error('❌ Error getting tokens:', err);
  }
});
