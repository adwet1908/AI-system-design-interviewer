import dotenv from 'dotenv';

dotenv.config();

const required = [
  'ANTHROPIC_API_KEY',
  'MONGODB_URI',
  'CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
];

const missing = required.filter((key) => !process.env[key]?.trim());

if (missing.length > 0) {
  console.error(
    `Missing required environment variable(s): ${missing.join(', ')}. ` +
      'Copy server/.env.example to server/.env and fill in the values.'
  );
  process.exit(1);
}

export const config = {
  port: Number(process.env.PORT) || 3001,
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
  mongodbUri: process.env.MONGODB_URI,
  clerkPublishableKey: process.env.CLERK_PUBLISHABLE_KEY,
  clerkSecretKey: process.env.CLERK_SECRET_KEY,
  // Razorpay is optional: without keys the app runs and billing routes return 503.
  razorpayKeyId: process.env.RAZORPAY_KEY_ID?.trim() || null,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET?.trim() || null,
  premiumPassPricePaise: Number(process.env.PREMIUM_PASS_PRICE_PAISE) || 29900,
  premiumPassDays: Number(process.env.PREMIUM_PASS_DAYS) || 30,
  // Interview length limits; the auto-end at the limit also caps LLM spend per session.
  freeSessionMinutes: Number(process.env.FREE_SESSION_MINUTES) || 15,
  premiumSessionMinutes: Number(process.env.PREMIUM_SESSION_MINUTES) || 30,
  // Interviews a user may start per day. The day rolls over at midnight in quotaTimeZone.
  freeDailyInterviews: Number(process.env.FREE_DAILY_INTERVIEWS) || 1,
  premiumDailyInterviews: Number(process.env.PREMIUM_DAILY_INTERVIEWS) || 3,
  quotaTimeZone: process.env.QUOTA_TIMEZONE?.trim() || 'Asia/Kolkata',
};

try {
  new Intl.DateTimeFormat('en-CA', { timeZone: config.quotaTimeZone });
} catch {
  console.error(`Invalid QUOTA_TIMEZONE: ${config.quotaTimeZone} (use an IANA name like Asia/Kolkata).`);
  process.exit(1);
}

export const billingEnabled = Boolean(config.razorpayKeyId && config.razorpayKeySecret);
