import type { AuthService } from "@/lib/auth-service";
import { invariant } from "@epic-web/invariant";
import {
  createFileRoute,
  Link,
  notFound,
  Outlet,
  useMatchRoute,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { ChevronsUpDown } from "lucide-react";
import { AppLogoIcon } from "@/components/app-logo-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const beforeLoadServerFn = createServerFn({ method: "GET" })
  .inputValidator((organizationId: string) => organizationId)
  .handler(async ({ context: { session, authService }, data }) => {
    invariant(session, "Missing session");

    const request = getRequest();

    const organizations = await authService.api.listOrganizations({
      headers: request.headers,
    });

    const organization = organizations.find((org) => org.id === data);

    if (!organization) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw notFound();
    }

    return {
      organization,
      organizations,
      sessionUser: session.user,
    };
  });

export const Route = createFileRoute("/app/$organizationId")({
  beforeLoad: async ({ params }) =>
    await beforeLoadServerFn({ data: params.organizationId }),
  component: RouteComponent,
});

function RouteComponent() {
  const { organization, organizations, sessionUser } = Route.useRouteContext();

  return (
    <SidebarProvider>
      <AppSidebar
        organization={organization}
        organizations={organizations}
        user={sessionUser}
      />
      <main className="flex h-svh w-full flex-col overflow-x-hidden">
        <SidebarTrigger />
        <Outlet />
      </main>
    </SidebarProvider>
  );
}

function AppSidebar({
  organization,
  organizations,
}: {
  organization: AuthService["$Infer"]["Organization"];
  organizations: AuthService["$Infer"]["Organization"][];
  user: { email: string };
}) {
  const matchRoute = useMatchRoute();

  const items = [
    {
      id: "Organization Home",
      href: `/app/${organization.id}`,
      to: "/app/$organizationId" as const,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion
      params: { organizationId: String(organization.id) },
    },
    {
      id: "Invitations",
      href: `/app/${organization.id}/invitations`,
      to: "/app/$organizationId/invitations" as const,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion
      params: { organizationId: String(organization.id) },
    },
  ];

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex w-full items-center gap-2 p-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Home"
            render={<Link to="/" />}
          >
            <AppLogoIcon className="text-primary size-7" />
          </Button>
          <OrganizationSwitcher
            organizations={organizations}
            organization={organization}
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={Boolean(matchRoute({ to: item.href }))}
                    render={
                      <Link to={item.to} params={item.params}>
                        {item.id}
                      </Link>
                    }
                  />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

function OrganizationSwitcher({
  organizations,
  organization,
}: {
  organizations: AuthService["$Infer"]["Organization"][];
  organization: AuthService["$Infer"]["Organization"];
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(props) => (
          <Button
            {...props}
            variant="ghost"
            className="h-auto flex-1 items-center justify-between p-0 text-left font-medium data-hovered:bg-transparent"
          >
            <div className="grid leading-tight">
              <span className="truncate font-medium">{organization.name}</span>
            </div>
            <ChevronsUpDown className="text-muted-foreground ml-2 size-4" />
          </Button>
        )}
      />
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Switch Organization</DropdownMenuLabel>
          {organizations.map((org) => (
            <DropdownMenuItem
              key={org.id}
              render={
                <Link
                  to="/app/$organizationId"
                  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion
                  params={{ organizationId: String(org.id) }}
                />
              }
            >
              {org.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
