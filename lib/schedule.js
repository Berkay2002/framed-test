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
  try {
    console.log("Running scheduled room heartbeat check");
    
    const appUrl = getAppUrl();
    const endpoint = `${appUrl}/api/room-heartbeat`;
    
    console.log(`Calling room heartbeat endpoint: ${endpoint}`);
    
    // Prepare headers for the API call
    const headers = {
      // Add a header to identify this as a scheduled job for logging purposes
      'x-source': 'scheduled-job'
    };
    
    // Add authorization header if CRON_SECRET is available
    if (process.env.CRON_SECRET) {
      headers['Authorization'] = `Bearer ${process.env.CRON_SECRET}`;
    } else if (process.env.SCHEDULER_API_KEY) {
      // Fallback to API key if CRON_SECRET isn't available
      headers['x-api-key'] = process.env.SCHEDULER_API_KEY;
    }
    
    // Make a request to our room-heartbeat API endpoint
    const response = await fetch(endpoint, {
      method: 'GET',
      headers
    });
    
    if (!response.ok) {
      console.error(`Room heartbeat check failed: ${response.status} ${response.statusText}`);
      
      // Try to get more error details
      try {
        const errorText = await response.text();
        console.error(`Error details: ${errorText}`);
      } catch (textError) {
        // Ignore errors when trying to get error text
      }
      
      return false;
    }
    
    const result = await response.json();
    
    console.log("Room heartbeat check results:", result);
    
    // Log details of the cleanup
    if (result.results) {
      console.log(`Checked ${result.results.checked} rooms`);
      console.log(`Emptied ${result.results.emptied} rooms`);
      console.log(`Marked ${result.results.marked_completed} rooms as completed`);
      
      if (result.results.errors > 0) {
        console.warn(`Encountered ${result.results.errors} errors during room cleanup`);
      }
    }
    
    return result.success;
  } catch (error) {
    console.error("Error in scheduled room heartbeat check:", error);
    return false;
  }
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
