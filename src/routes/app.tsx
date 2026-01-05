import {
  createFileRoute,
  Link,
  notFound,
  Outlet,
  redirect,
  useMatchRoute,
} from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { ChevronsUpDown, LogOut } from "lucide-react";
import { AppLogoIcon } from "@/components/app-logo-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { signOutServerFn } from "@/lib/auth-service";

const beforeLoadServerFn = createServerFn().handler(
  ({ context: { session } }) => {
    if (!session?.user) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({ to: "/login" });
    }
    if (session.user.role !== "user") {
      // Cannot throw Response directly - TanStack Start serializes errors to transfer
      // from server to client, and Response contains non-serializable properties
      // (ReadableStream, Headers, etc.). Using notFound() is a safe alternative.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw notFound();
    }
    return { sessionUser: session.user };
  },
);

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    return await beforeLoadServerFn();
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { sessionUser } = Route.useRouteContext();
  return (
    <SidebarProvider>
      <AppSidebar user={sessionUser} />
      <main className="flex h-svh w-full flex-col overflow-x-hidden">
        <SidebarTrigger />
        <Outlet />
      </main>
    </SidebarProvider>
  );
}

function AppSidebar({ user }: { user: { email: string } }) {
  const matchRoute = useMatchRoute();

  return (
    <Sidebar>
      <SidebarHeader className="items-center justify-center">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Home"
          render={<Link to="/" />}
        >
          <AppLogoIcon className="text-primary size-7" />
        </Button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={Boolean(matchRoute({ to: "/app" }))}
                  render={<Link to="/app">Dashboard</Link>}
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}

function NavUser({ user }: { user: { email: string } }) {
  const signOutFn = useServerFn(signOutServerFn);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={(props) => (
          <SidebarMenuButton
            {...props}
            className="h-12 w-full justify-start overflow-hidden rounded-md p-2 text-left text-sm font-normal"
          >
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.email}</span>
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </SidebarMenuButton>
        )}
      />
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="truncate px-1 py-1.5 text-center text-sm font-medium">
            {user.email}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void signOutFn()}>
          <LogOut className="mr-2 size-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
