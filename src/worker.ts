import type { Repository } from "@/lib/repository";
import serverEntry from "@tanstack/react-start/server-entry";
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

export default {
  async fetch(request, env, _ctx) {
    console.log("worker.ts: fetch", request.url);
    return serverEntry.fetch(request, {
      context: {
        env,
        repository: createRepository({ db: env.D1 }),
      },
    });
  },
} satisfies ExportedHandler<Env>;
