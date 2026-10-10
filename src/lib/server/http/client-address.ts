/** Carries `event.getClientAddress()` to better-auth, whose IP lookup reads only request headers
 * and trusts a header only when it holds a single address. hooks.server.ts overwrites it on every
 * request, so a value a client sends under this name never survives. The address itself is
 * adapter-node's answer (ADDRESS_HEADER/XFF_DEPTH, the rightmost X-Forwarded-For hop in Docker),
 * so better-auth and the app's own rate limiter key on the same client. */
export const CLIENT_ADDRESS_HEADER = 'x-yumbry-client-ip';
