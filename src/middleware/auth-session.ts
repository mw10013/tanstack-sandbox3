import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export const authSessionMiddleware = createMiddleware().server(
  async ({ next, context }) => {
    const request = getRequest();
    const session = await context.authService.api.getSession(request);
    return next({
      context: {
        ...context,
        session,
      },
    });
  },
);
