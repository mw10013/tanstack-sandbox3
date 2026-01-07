# Analysis: Organization Context Properties in crrbuis and Implementation Plan for TanStack Start

This document analyzes how crrbuis implements organization context and provides a plan for bringing this pattern into tanstack-sandbox3 using TanStack Start idioms and patterns.

## Overview

The crrbuis application uses React Router with a custom `RequestContext` to provide `session`, `organization`, and `organizations` properties throughout the application. This pattern solves authentication and authorization challenges in a multi-tenant SaaS application.

## crrbuis Implementation Pattern

### RequestContext Interface

```typescript
export interface RequestContext {
  env: Env;
  authService: AuthService;
  repository: Repository;
  stripeService: StripeService;
  session?: AuthService["$Infer"]["Session"];
  organization?: AuthService["$Infer"]["Organization"];
  organizations?: AuthService["$Infer"]["Organization"][];
}
```

### How Properties Are Populated

**`session` property:**

- Populated in `workers/app.ts` at request entry point
- Fetched once using `authService.api.getSession({ headers })`
- Available to all routes via React Router context

**`organization` and `organizations` properties:**

- Populated in middleware for routes under `/app/:organizationId`
- Middleware calls `authService.api.listOrganizations({ headers })`
- Finds specific organization matching route parameter
- Updates RequestContext with both properties

### Usage Patterns

1. **Route Guards**: Middleware checks session presence and redirects if not authenticated
2. **Authorization**: Middleware validates organization membership before setting context
3. **Loaders**: Access context to get session/org data without re-fetching
4. **Components**: Use context for organization switchers and navigation

---

## TanStack Start Adaptation Strategy

### Key Differences

| Aspect            | crrbuis (React Router)          | TanStack Start                                 |
| ----------------- | ------------------------------- | ---------------------------------------------- |
| Context System    | `RouterContextProvider`         | Module augmentation of `@tanstack/react-start` |
| Entry Point       | `workers/app.ts`                | `src/worker.ts`                                |
| Route Definitions | React Router file-based routing | TanStack Router file-based routing (similar)   |
| Middleware        | `Route.MiddlewareFunction`      | `beforeLoad` hook                              |
| Context Access    | `context.get(RequestContext)`   | `Route.useRouteContext()`                      |

### Current State

Our project already has:

- `session` property in `ServerContext` (worker.ts:14)
- `session` populated in worker.ts (line 36-38)
- Basic app route structure with `/app` and `/app/`

### What's Missing

- `organization` and `organizations` properties in `ServerContext`
- Route structure to handle `/app/:organizationId` URLs
- beforeLoad logic to populate organization context
- Redirect logic for `/app/` to use `activeOrganizationId`

---

## Implementation Plan

### Phase 1: Update ServerContext Interface

**File:** `src/worker.ts`

Add organization properties to the existing `ServerContext` interface:

```typescript
export interface ServerContext {
  env: Env;
  repository: Repository;
  authService: AuthService;
  stripeService: StripeService;
  session?: AuthService["$Infer"]["Session"];
  organization?: AuthService["$Infer"]["Organization"];
  organizations?: AuthService["$Infer"]["Organization"][];
}
```

**Question for user:** Should `organization` and `organizations` be populated in worker.ts like `session` is, or should they only be populated in route-level `beforeLoad` hooks?

**Analysis:**

- Populating in worker: Fetches organizations for every request (even routes that don't need them)
- Populating in route `beforeLoad`: Only fetches when needed (better for performance)

**Recommendation:** Populate in route-level `beforeLoad` for organization-scoped routes only.

---

### Phase 2: Create App Layout Route Structure

Based on TanStack Router's file naming conventions, we have two options:

**Option A: Flat route structure**

```
src/routes/
  app.tsx                          # /app (existing layout route)
  app._index.tsx                     # /app/ (existing, needs update)
  app.$organizationId.tsx              # /app/:organizationId (new layout)
  app.$organizationId._index.tsx       # /app/:organizationId/ (new)
  app.$organizationId.members.tsx        # /app/:organizationId/members (future)
  app.$organizationId.billing.tsx       # /app/:organizationId/billing (future)
```

**Option B: Directory route structure**

```
src/routes/
  app.tsx                          # /app (existing layout route)
  app/
    _index.tsx                     # /app/ (existing, move)
    $organizationId.tsx             # /app/:organizationId (new layout)
    $organizationId/
      _index.tsx                   # /app/:organizationId/ (new)
      members.tsx                  # /app/:organizationId/members (future)
      billing.tsx                 # /app/:organizationId/billing (future)
```

**Question for user:** Which structure do you prefer?

**Analysis:**

- Option A (flat): Fewer directory levels, easier to see all app routes at a glance
- Option B (directory): Better organization as number of org routes grows

**Recommendation:** Option A (flat) for now, as crrbuis uses this pattern and it scales well.

---

### Phase 3: Update `/app/` Index Route

**File:** `src/routes/app._index.tsx`

Add logic to redirect users to their active organization:

```typescript
import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/")({
  beforeLoad: async ({ context: { session } }) => {
    if (!session?.user) {
      throw redirect({ to: "/login" });
    }

    const activeOrganizationId = session.session.activeOrganizationId;

    if (activeOrganizationId) {
      throw redirect({ to: `/app/${activeOrganizationId}` });
    }

    // User has no organizations - show creation flow or error
    return {
      needsOrgCreation: true,
    };
  },
  component: RouteComponent,
});

function RouteComponent() {
  const { needsOrgCreation } = Route.useRouteContext();

  if (needsOrgCreation) {
    return <div className="p-6">No organizations found. Create one to get started.</div>;
  }

  return null; // Will never reach here due to redirect
}
```

**Key Points:**

- Checks for authentication (redirect to `/login` if not)
- Uses `activeOrganizationId` from session (populated by Better Auth's session create hook)
- Redirects to organization-specific URL if active org exists
- Shows creation flow if user has no organizations

**Question for user:** What should happen if a user has no organizations? In crrbuis, users get auto-created an organization on sign-up. Should we do the same?

---

### Phase 4: Create Organization Layout Route

**File:** `src/routes/app.$organizationId.tsx` (new)

Create a layout route that populates organization context:

```typescript
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/app/$organizationId")({
  beforeLoad: async ({
    context: { session, authService },
    params: { organizationId },
  }) => {
    if (!session?.user) {
      throw redirect({ to: "/login" });
    }

    const organizations = await authService.api.listOrganizations({
      headers: new Headers(),
    });

    const organization = organizations.find((org) => String(org.id) === organizationId);

    if (!organization) {
      throw redirect({ to: "/app" });
    }

    return {
      organization,
      organizations,
      sessionUser: session.user,
    };
  },
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
```

**Key Points:**

- `beforeLoad` runs before child routes' loaders (executes sequentially parent→child)
- Fetches organizations using Better Auth API
- Validates that user has access to requested organization
- Returns organization context merged into route context
- Child routes (`/app/:organizationId/`, `/app/:organizationId/members`, etc.) inherit this context

**Question for user:** How should we get headers for the `listOrganizations` call? In TanStack Start server functions, we need access to the request headers. I see in crrbuis they use `request.headers` from route loader args, but in `beforeLoad` we don't have direct access to headers. Need to research this.

---

### Phase 5: Create Organization Index Route

**File:** `src/routes/app.$organizationId._index.tsx` (new)

Create the organization dashboard page:

```typescript
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/app/$organizationId/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { organization } = Route.useRouteContext();

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold tracking-tight">
        {organization.name}
      </h1>
      <p className="text-muted-foreground text-sm mt-2">
        Organization ID: {organization.id}
      </p>
    </div>
  );
}
```

---

## TanStack Start Context Pattern

### How Context Works

In TanStack Start, context is established through module augmentation:

**In `src/worker.ts`:**

```typescript
declare module "@tanstack/react-start" {
  interface Register {
    server: { requestContext: ServerContext };
  }
}
```

**In routes:** Access context via `Route.useRouteContext()`:

```typescript
const { session, organization } = Route.useRouteContext();
```

### beforeLoad vs loader

Based on TanStack Router documentation and AGENTS.md:

| Feature             | beforeLoad                          | loader                                 |
| ------------------- | ----------------------------------- | -------------------------------------- |
| **Purpose**         | Route guards, context population    | Data fetching                          |
| **Execution Order** | Sequential parent→child             | Parallel across all active routes      |
| **Return Value**    | Merged into context                 | Available as `loaderData` in component |
| **Best For**        | Auth checks, org context validation | Fetching data specific to route        |

**Our Pattern:**

- Use `beforeLoad` for:
  - Session validation (redirect if not authenticated)
  - Organization authorization (fetch and validate membership)
  - Context population (session, organization, organizations)
- Use `loader` for:
  - Route-specific data fetching (dashboard stats, member lists, etc.)
  - Data that varies between routes under the same organization

---

## Questions for User

1. **Context Population Location**: Should `organization` and `organizations` be populated in `worker.ts` (global) or route `beforeLoad` (scoped)?

2. **Route Structure Preference**: Do you prefer flat routes (`app.$organizationId._index.tsx`) or directory routes (`app/$organizationId/_index.tsx`)?

3. **No Organizations Flow**: What should happen if a user signs in but has no organizations?
   - Auto-create (like crrbuis)?
   - Show creation UI?
   - Error message?

4. **Headers Access in beforeLoad**: How do we access request headers in `beforeLoad` for the `listOrganizations` call? Need to verify TanStack Start pattern for this.

---

## References

### crrbuis Codebase

- `refs/crrbuis/lib/request-context.ts` - RequestContext interface
- `refs/crrbuis/workers/app.ts:82-90` - Session population
- `refs/crrbuis/app/routes/app.$organizationId.tsx:33-51` - Organization middleware
- `refs/crrbuis/app/routes/app.$organizationId.tsx:55-71` - Loader using context
- `refs/crrbuis/app/routes/app.$organizationId.tsx:78-94` - Component using context

### TanStack Router Documentation

- `refs/tan-router/docs/router/framework/react/routing/file-naming-conventions.md` - File naming rules
- `refs/tan-router/docs/router/framework/react/routing/file-based-routing.md` - File-based routing concepts
- AGENTS.md - beforeLoad vs loader guidelines

### Current Project

- `src/worker.ts` - Server context definition and population
- `src/routes/app.tsx` - Existing app layout route
- `src/routes/app.index.tsx` - Existing app index route
- `src/lib/auth-service.ts` - Better Auth configuration
