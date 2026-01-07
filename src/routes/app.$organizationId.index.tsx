import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/$organizationId/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { organization } = Route.useRouteContext();

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold tracking-tight">{organization.name}</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Organization ID: {organization.id}
      </p>
    </div>
  );
}
