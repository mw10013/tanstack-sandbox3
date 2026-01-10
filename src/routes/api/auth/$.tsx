import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: async ({ request, context }) => {
        console.log(`Auth route GET: ${request.url}`);
        return context.authService.handler(request);
      },
      POST: async ({ request, context }) => {
        console.log(`Auth route POST: ${request.url}`);
        return context.authService.handler(request);
      },
    },
  },
});
