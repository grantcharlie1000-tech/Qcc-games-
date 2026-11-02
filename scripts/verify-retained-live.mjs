// Retained caching generations have been retired. Run the local production
// recovery audit instead; this command does not inspect or change live profiles.
await import('./verify-offline.mjs');
