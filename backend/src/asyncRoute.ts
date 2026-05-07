import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Express 4: bắt lỗi từ async handler và gửi tới error middleware (next(err)). */
export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}
