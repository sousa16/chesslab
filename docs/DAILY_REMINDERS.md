# Daily Reminder Email Setup

## Overview
Users can opt-in to receive daily reminder emails if they have chess positions that are overdue for practice (more than 24 hours past their review date).

## Features
- Email sent only if user has enabled daily reminders in settings
- Only sent if user has positions overdue by more than 24 hours
- Duolingo-style motivational email with gradient design
- Shows count of overdue positions
- Direct link to training page

## Setup

### 1. Database Migration
Run the migration to add the `dailyReminder` field to the User model:
```bash
npx prisma migrate dev
```

### 2. Environment Variables
Ensure these are set in your `.env` file:
```
RESEND_API_KEY=your_resend_api_key
FROM_EMAIL=noreply@yourdomain.com
NEXTAUTH_URL=https://yourdomain.com
CRON_SECRET=your_secret_token_here  # Optional but recommended for production
```

### 3. Cron Job Configuration
The email is sent via a cron job that runs daily at 9 AM UTC.

#### Vercel (Automatic)
If deploying to Vercel, the `vercel.json` file automatically configures the cron job.

#### Manual Cron Setup
If not using Vercel, set up a cron job to hit the endpoint:
```bash
# Example: Run at 9 AM daily
0 9 * * * curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://yourdomain.com/api/cron/send-daily-reminders
```

Or use a service like:
- GitHub Actions (with scheduled workflows)
- EasyCron
- Cron-job.org

### 4. Testing
To test the email manually:
```bash
# With CRON_SECRET
curl -H "Authorization: Bearer YOUR_CRON_SECRET" http://localhost:3000/api/cron/send-daily-reminders

# Without CRON_SECRET (local dev)
curl http://localhost:3000/api/cron/send-daily-reminders
```

## How It Works

1. **User enables daily reminders** in Settings → Training section
2. **Setting is saved** to both localStorage (client) and database (server)
3. **Cron job runs daily** at 9 AM UTC via `/api/cron/send-daily-reminders`
4. **System checks** all users with `dailyReminder: true` and verified email
5. **For each user**, counts positions with `nextReviewDate` older than 24 hours
6. **If count > 0**, sends a motivational email with the count
7. **Email includes** direct link to training page

## Email Content
- Subject: "🔥 Don't break your streak! X position(s) waiting"
- Gradient header with personalized greeting
- Overdue position count in highlighted circle
- Motivational message (varies based on count)
- "Start Training" call-to-action button
- Footer with unsubscribe info

## API Endpoints

### `PATCH /api/user/update-settings`
Updates user's daily reminder preference in database.

**Body:**
```json
{
  "dailyReminder": true
}
```

### `GET /api/cron/send-daily-reminders`
Checks all users and sends reminder emails to eligible users.

**Headers:**
```
Authorization: Bearer YOUR_CRON_SECRET
```

**Response:**
```json
{
  "success": true,
  "emailsSent": 5,
  "results": [
    {
      "email": "user@example.com",
      "overdueCount": 12,
      "success": true
    }
  ]
}
```
