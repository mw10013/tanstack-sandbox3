import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

interface AuthSession {
  user: {
    id: string;
    email: string;
    name?: string;
    image?: string | null;
    emailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  session: {
    id: string;
    userId: string;
    expiresAt: Date;
    token: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    activeOrganizationId?: number | null;
  };
}

export const authSessionMiddleware = createMiddleware().server(
  async ({ next, context }) => {
    const request = getRequest();
    const session = await context.authService.api.getSession(request);

    return next({
      context: {
        session: session as AuthSession | null,
      },
    });
  },
);
