declare global {
  namespace Express {
    interface Request {
      user?: { sub?: string };
      accessToken?: string;
    }
  }
}

export {};
