declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth from the session; only present on authenticated requests. */
      userId?: number;
      /** Set by requireAuth alongside userId, from the same DB row it already
       * fetches to check tokenVersion — lets controllers that only need
       * these fields (getMe, postAiChat) skip a redundant re-fetch. */
      user?: { id: number; email: string; locale: string };
    }
  }
}

export {};
