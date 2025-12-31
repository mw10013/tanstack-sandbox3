import {
  Link,
  Outlet,
  createFileRoute,
  useMatchRoute,
} from '@tanstack/react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'

export const Route = createFileRoute('/_layout')({
  component: Layout,
})

function Layout() {
  const matchRoute = useMatchRoute()

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full">
        <Sidebar>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Navigation</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={Boolean(matchRoute({ to: '/' }))}
                      render={<Link to="/">Home</Link>}
                    />
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion
                      isActive={Boolean(matchRoute({ to: '/example' }))}
                      render={<Link to="/example">Example</Link>}
                    />
                  </SidebarMenuItem>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion
                      isActive={Boolean(matchRoute({ to: '/form3' }))}
                      render={<Link to="/form3">Form 3</Link>}
                    />
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <main className="flex-1">
          <SidebarTrigger className="m-4" />
          <Outlet />
        </main>
      </div>
    </SidebarProvider>
  )
}
