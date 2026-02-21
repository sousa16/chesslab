import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendDailyReminderEmail } from "@/lib/email";

// This endpoint should be called by a cron job (e.g., Vercel Cron, GitHub Actions, etc.)
// You can protect it with a secret token in production
export async function GET(request: Request) {
  try {
    // Optional: Add authentication via secret token
    const authHeader = request.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Find users with daily reminders enabled
    const usersWithReminders = await prisma.user.findMany({
      where: {
        dailyReminder: true,
        email: { not: null },
        emailVerified: { not: null },
      },
      select: {
        id: true,
        email: true,
        name: true,
      },
    });

    const results = [];

    for (const user of usersWithReminders) {
      // Get count of overdue positions for this user
      const overdueCount = await prisma.repertoireEntry.count({
        where: {
          repertoire: {
            userId: user.id,
          },
          nextReviewDate: {
            lt: twentyFourHoursAgo,
          },
        },
      });

      // Only send email if user has overdue positions
      if (overdueCount > 0 && user.email) {
        const result = await sendDailyReminderEmail(user.email, overdueCount, user.name || undefined);
        results.push({
          email: user.email,
          overdueCount,
          success: result.success,
        });
      }
    }

    return NextResponse.json({
      success: true,
      emailsSent: results.length,
      results,
    });
  } catch (error) {
    console.error("Failed to send daily reminders:", error);
    return NextResponse.json(
      { error: "Failed to send daily reminders" },
      { status: 500 }
    );
  }
}
