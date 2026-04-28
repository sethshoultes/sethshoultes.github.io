// Set this to the Cloudflare Worker URL after deploying ../sethshoultes-avatar-worker.
// Example: "https://sethshoultes-avatar-token.<your-subdomain>.workers.dev"
window.AVATAR_WORKER_URL = "";

// Optional fallback iframe — used if the worker URL is empty or fails.
// This is the embed URL Seth already had configured at HeyGen.
window.AVATAR_FALLBACK_EMBED = "https://embed.liveavatar.com/v1/8d719b40-072c-4199-9911-3e53f4a324d7?orientation=horizontal";
