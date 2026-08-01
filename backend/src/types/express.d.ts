declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth from the session; only present on authenticated requests. */
      userId?: number;
    }
  }
}

export {};
