import type { AuthService } from "@/lib/auth-service";
import type { Repository } from "@/lib/repository";
import type { StripeService } from "@/lib/stripe-service";
import serverEntry from "@tanstack/react-start/server-entry";
import { createAuthService } from "@/lib/auth-service";
import { createRepository } from "@/lib/repository";
import { createStripeService } from "@/lib/stripe-service";

export interface ServerContext {
  env: Env;
  repository: Repository;
  authService: AuthService;
  stripeService: StripeService;
  session?: AuthService["$Infer"]["Session"];
}

declare module "@tanstack/react-start" {
  interface Register {
    server: { requestContext: ServerContext };
  }
}

export default {
  async fetch(request, env, _ctx) {
    console.log("worker.ts: fetch", request.url);
    const repository = createRepository({ db: env.D1 });
    const stripeService = createStripeService(env.STRIPE_SECRET_KEY);
    const authService = createAuthService({
      db: env.D1,
      stripeService,
      kv: env.KV,
      baseURL: env.BETTER_AUTH_URL,
      secret: env.BETTER_AUTH_SECRET,
      demoMode: env.DEMO_MODE === "true",
      transactionalEmail: env.TRANSACTIONAL_EMAIL,
    });
    const session = await authService.api.getSession({
      headers: request.headers,
    });
    return serverEntry.fetch(request, {
      context: {
        env,
        repository,
        authService,
        stripeService,
        session: session ?? undefined,
      },
    });
  },
} satisfies ExportedHandler<Env>;
