import { NextRequest, NextResponse } from "next/server";
const schedule = require('@/lib/schedule');

// Scheduler API to run scheduled jobs
// Can be triggered by:
// 1. Vercel cron job (automatic, based on vercel.json configuration)
// 2. External cron service with API key
// 3. Manual trigger with API key

export async function GET(request: NextRequest) {
  try {
    console.log("Running scheduled jobs via API");
    
    // Check if request is from Vercel Cron
    const isVercelCron = request.headers.get('x-vercel-cron') === '1';
    
    // If not from Vercel Cron, verify API key
    if (!isVercelCron) {
      const apiKey = request.headers.get('x-api-key');
      const schedulerKey = process.env.SCHEDULER_API_KEY;
      
      // Check if API key is valid
      if (!schedulerKey || apiKey !== schedulerKey) {
        console.warn("Invalid or missing API key for scheduler");
        return NextResponse.json({
          success: false,
          message: "Unauthorized"
        }, { status: 401 });
      }
    } else {
      console.log("Request from Vercel Cron detected - authorized");
    }
    
    // Run all scheduled jobs
    await schedule.runAllJobs();
    
    return NextResponse.json({
      success: true,
      message: "Scheduled jobs executed successfully",
      source: isVercelCron ? "vercel-cron" : "api-key"
    });
  } catch (error: unknown) {
    console.error("Error running scheduled jobs:", error);
    
    return NextResponse.json({
      success: false,
      message: "Error running scheduled jobs",
      error: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
} 