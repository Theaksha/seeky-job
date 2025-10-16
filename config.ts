/**
 * A list of allowed origins that can embed and interact with the chatbot iframe.
 * It's recommended to set this in your environment variables (e.g., in a .env.local file).
 * @example NEXT_PUBLIC_ALLOWED_ORIGINS="http://localhost:3000,https://your-staging-site.com,https://your-production-site.com"
 */
export const ALLOWED_ORIGINS: string[] = (process.env.NEXT_PUBLIC_ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean); // This removes any empty strings from the array
