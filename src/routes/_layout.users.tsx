import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const getUsers = createServerFn({ method: "GET" }).handler(
  async ({ context }) => {
    return await context.repository.getUsers({
      limit: 10,
      offset: 0,
    });
  },
);

export const Route = createFileRoute("/_layout/users")({
  loader: () => getUsers(),
  component: Users,
});

function Users() {
  const data = Route.useLoaderData();
  return (
    <div className="p-4">
      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
