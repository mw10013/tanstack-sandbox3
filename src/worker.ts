import type { Repository } from "@/lib/repository";
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { env } from "cloudflare:workers";
import { createRepository } from "@/lib/repository";

interface ServerContext {
  env: Env;
  repository: Repository;
}

declare module "@tanstack/react-start" {
  interface Register {
    server: { requestContext: ServerContext };
  }
}

export default createServerEntry({
  fetch: async (request: Request) => {
    console.log("worker.ts: fetch", request.url);
    return handler.fetch(request, {
      context: {
        env,
        repository: createRepository({ db: env.D1 }),
      },
    });
  },
} satisfies { fetch: (request: Request) => Promise<Response> });
