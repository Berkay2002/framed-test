/**
 * This file contains scheduled jobs that should run periodically.
 * It's used by the scheduler API endpoint and can be called directly if needed.
 * 
 * In production, this will be triggered by Vercel cron jobs as defined in vercel.json.
 */

// Helper to determine the application URL in different environments
const getAppUrl = () => {
  // Check for explicit app URL first
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  
  // In Vercel production environments
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  
  // In Vercel preview environments
  if (process.env.VERCEL_BRANCH_URL) {
    return `https://${process.env.VERCEL_BRANCH_URL}`;
  }
  
  // Local development fallback
  return 'http://localhost:3000';
};

/**
 * Run the room heartbeat job to clean up empty game rooms
 */
const runRoomHeartbeat = async () => {
  console.log("Room heartbeat functionality has been removed from the application");
  return true; // Return success to avoid errors in the scheduler
};

// Export individual jobs
module.exports = {
  runRoomHeartbeat
};

// Function to run all scheduled jobs
const runAllJobs = async () => {
  console.log("Running all scheduled jobs");
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  let results = {
    roomHeartbeat: false
  };
  
  try {
    // Run room heartbeat
    results.roomHeartbeat = await runRoomHeartbeat();
    
    // Add more jobs here as needed
    
    console.log("All scheduled jobs completed");
    console.log("Results:", results);
    
    return results;
  } catch (error) {
    console.error("Error running scheduled jobs:", error);
    return {
      ...results,
      error: error.message || "Unknown error"
    };
  }
};

// Export the main runner
module.exports.runAllJobs = runAllJobs;

// Allow direct execution from command line
if (require.main === module) {
  runAllJobs()
    .then(results => {
      console.log("Final results:", results);
      // Exit with appropriate code
      process.exit(Object.values(results).every(Boolean) ? 0 : 1);
    })
    .catch(error => {
      console.error("Fatal error in scheduled jobs:", error);
      process.exit(1);
    });
} 