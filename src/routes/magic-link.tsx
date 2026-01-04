import { createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

export const verifyMagicLinkFn = createServerFn({ method: "GET" }).handler(
  async ({ context: { authService, env } }) => {
    const request = new Request(env.BETTER_AUTH_URL);
    const session = await authService.api.getSession({
      headers: request.headers,
    });

    if (session?.user.role === "admin") {
      throw redirect({ to: "/admin" });
    } else if (session?.user.role === "user") {
      throw redirect({ to: "/app" });
    }

    return {
      error: `Invalid role: ${session?.user.role ?? "unknown"}`,
    };
  },
);

export const Route = createFileRoute("/magic-link")({
  loader: async ({ location }) => {
    const params = new URLSearchParams(location.searchStr);
    const error = params.get("error");
    if (error) {
      return { error };
    }
    return verifyMagicLinkFn();
  },
  component: RouteComponent,
});

function RouteComponent() {
  const data = Route.useLoaderData();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-2xl font-bold">Magic Link Error</h1>
      <p className="mt-4">{data.error}</p>
      <p className="mt-4">
        Try{" "}
        <a href="/login" className="underline">
          signing in
        </a>{" "}
        again.
      </p>
    </div>
  );
}
