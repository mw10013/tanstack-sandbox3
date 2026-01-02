# TanStack Start Server Entry Point and Context Analysis

## Overview

This document analyzes the TanStack Start server entry point system and its context propagation mechanism, based on reference code from the TanStack Start repository and the crrbuis saas template.

## Server Entry Point

### What It Solves

The server entry point (`@tanstack/react-start/server-entry`) serves as the single fetch handler for Cloudflare Workers deployments. It solves several critical problems:

1. **Single fetch handler** for all request types (SSR, API routes, server functions)
2. **Context propagation** - Attach request-scoped data (DB connections, auth, etc.) that flows through middleware, loaders, and server functions
3. **SSR orchestration** - Handles streaming SSR with proper hydration support
4. **Middleware chain execution** - Executes global and route-specific middleware in the correct order

### Implementation Location

The server entry point is defined in `refs/tan-start/packages/react-start/src/default-entry/server.ts`:

```typescript
import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'

const fetch = createStartHandler(defaultStreamHandler)

export type ServerEntry = { fetch: RequestHandler<Register> }

export function createServerEntry(entry: ServerEntry): ServerEntry {
  return {
    async fetch(...args) {
      return await entry.fetch(...args)
    }
  }
}

export default createServerEntry({ fetch })
```

### Wrangler Configuration

The entry point is configured in `wrangler.jsonc`:

```jsonc
{
  "main": "./src/worker.ts",
  "d1_databases": [{ "binding": "D1", ... }],
  "kv_namespaces": [{ "binding": "KV", ... }]
}
```

Note: Change from `"main": "@tanstack/react-start/server-entry"` to `"main": "./src/worker.ts"` to use your custom entry point. Your `wrangler.jsonc` should be updated accordingly:

## Context Systems in TanStack Start

There are **two distinct but related context systems** in TanStack Start:

### 1. Request Context (Server-Side)

This is TanStack Start's server-side context that flows through middleware, server functions, and server routes.

#### What Problem It Solves

When handling server requests, you often need to pass data between middleware, server functions, and route handlers. Without context, you'd need to re-fetch or re-initialize dependencies (like DB connections, authenticated user info, etc.) at each step. Request context provides a clean way to attach and share data throughout the request lifecycle.

#### Use Cases

- **Authentication**: Attach the current user to the context after verification
- **Database connections**: Reuse a single DB connection across the request
- **Request-scoped services**: Logger, metrics collectors, etc.
- **Feature flags**: Per-request feature flag values
- **Environment bindings**: D1, KV, and other Cloudflare bindings

#### Type Definition

```typescript
// src/lib/server-context.ts
import type { D1Database, KVNamespace } from '@cloudflare/workers-types'

export interface ServerContext {
  env: {
    D1: D1Database
    KV: KVNamespace
  }
  db: D1Database
  user?: {
    id: string
    email: string
  }
}

declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: ServerContext
    }
  }
}
```

#### Setup in Worker Entry

```typescript
// src/worker.ts
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import type { D1Database, KVNamespace } from '@cloudflare/workers-types'

interface ServerContext {
  env: {
    D1: D1Database
    KV: KVNamespace
  }
  repository: {
    users: { findById: (id: string) => Promise<any> }
    sessions: { validate: (token: string) => Promise<any> }
  }
  auth: {
    getCurrentUser: (request: Request) => Promise<any>
  }
  user?: { id: string; email: string }
}

declare module '@tanstack/react-start' {
  interface Register {
    server: { requestContext: ServerContext }
  }
}

export default createServerEntry({
  async fetch(request: Request): Promise<Response> {
    const context: ServerContext = {
      env: {
        D1: process.env.D1 as unknown as D1Database,
        KV: process.env.KV as unknown as KVNamespace,
      },
      repository: {
        users: { findById: async (id) => null },
        sessions: { validate: async (token) => null },
      },
      auth: { getCurrentUser: async (request) => null },
    }
    return handler.fetch(request, { context })
  },
})
```

### Who Creates ServerContext?

**YOU (the developer) create the ServerContext.**

The framework does not create it for you. You are responsible for:

1. **Defining** the context type via module augmentation
2. **Creating** the context object per-request in your server entry point
3. **Passing** it to the TanStack Start handler

### The Creation Flow

```
Incoming Request
       ↓
Your fetch() in src/worker.ts (called once per request)
       ↓
Create ServerContext object (you write this code)
       ↓
Pass to handler.fetch(request, { context: YourContext })
       ↓
TanStack Start stores context in AsyncLocalStorage
       ↓
Middleware, Loaders, Server Functions receive via context parameter
```

### Where: src/worker.ts

This is the **only place** where you create the ServerContext. The file is your Cloudflare Workers entry point.

### When: Per-Request

The ServerContext is created **once per incoming HTTP request** inside the `fetch` function.

```typescript
// src/worker.ts
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import type { D1Database, KVNamespace } from '@cloudflare/workers-types'

interface ServerContext {
  env: { D1: D1Database; KV: KVNamespace }
  repository: { users: { findById: (id: string) => Promise<any> } }
  auth: { getCurrentUser: (request: Request) => Promise<any> }
  user?: { id: string; email: string }
}

declare module '@tanstack/react-start' {
  interface Register { server: { requestContext: ServerContext } }
}

export default createServerEntry({
  async fetch(request: Request): Promise<Response> {
    // This function is invoked ONCE for each incoming request
    const context: ServerContext = {
      env: {
        D1: process.env.D1 as unknown as D1Database,
        KV: process.env.KV as unknown as KVNamespace,
      },
      repository: { users: { findById: async (id) => null } },
      auth: { getCurrentUser: async (request) => null },
    }
    return handler.fetch(request, { context })
  },
})
```

### The Complete Pattern

**File**: `src/lib/server-context.ts` - Define the type

```typescript
import type { D1Database, KVNamespace } from '@cloudflare/workers-types'

export interface ServerContext {
  env: {
    D1: D1Database
    KV: KVNamespace
  }
  db: D1Database
  user?: {
    id: string
    email: string
  }
}

// Module augmentation for type safety throughout the app
declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: ServerContext
    }
  }
}
```

**File**: `src/worker.ts` - Create and pass context

```typescript
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import type { ServerContext } from '@/lib/server-context'

export default createServerEntry({
  async fetch(request: Request): Promise<Response> {
    // Create context per request - this is YOUR responsibility
    const context: ServerContext = {
      env: {
        D1: process.env.D1 as unknown as D1Database,
        KV: process.env.KV as unknown as KVNamespace,
      },
      db: process.env.D1 as unknown as D1Database,
      user: await getUserFromCookie(request),
    }
    
    // Pass context to TanStack Start - it will propagate to middleware/loaders
    return handler.fetch(request, { context })
  },
})
```

### How Context Flows Internally

From `refs/tan-start/packages/start-server-core/src/createStartHandler.ts:284-308`:

```typescript
const serverFnHandler = async ({ context }: TODO) => {
  return runWithStartContext(
    {
      getRouter,
      startOptions: requestStartOptions,
      contextAfterGlobalMiddlewares: context,  // ← Your context flows here
      request,
      executedRequestMiddlewares,
    },
    () =>
      handleServerAction({
        request,
        context: requestOpts?.context,  // ← And here
        serverFnId,
      }),
  )
}
```

TanStack Start wraps your context with internal data and stores it in AsyncLocalStorage:

**File**: `refs/tan-start/packages/start-storage-context/src/async-local-storage.ts`

```typescript
export async function runWithStartContext<T>(
  context: StartStorageContext,
  fn: () => T | Promise<T>,
): Promise<T> {
  return startStorage.run(context, fn)  // Stores context in AsyncLocalStorage
}
```

### Internal Context Structure

TanStack Start wraps your ServerContext with additional internal data:

```typescript
interface StartStorageContext {
  getRouter: () => Awaitable<RegisteredRouter>
  request: Request
  startOptions: any
  contextAfterGlobalMiddlewares: YourServerContext  // ← Your context is here
  executedRequestMiddlewares: Set<any>
}
```

Your ServerContext is passed through as `contextAfterGlobalMiddlewares` and is available to all middleware, loaders, and server functions via their `context` parameter.

#### Using Context in Middleware

```typescript
import { createMiddleware } from '@tanstack/react-start'

const authMiddleware = createMiddleware({ type: 'function' })
  .server(async ({ next, context }) => {
    // Access user from context
    if (!context.user) {
      throw new Error('Unauthorized')
    }
    
    // Add more context for downstream
    return next({
      context: {
        permissions: await getPermissions(context.user.id),
      },
    })
  })

const loggingMiddleware = createMiddleware({ type: 'function' })
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
    // Has both user and permissions
    console.log('Request by:', context.user.name)
    console.log('Permissions:', context.permissions)
    return next()
  })
```

#### Using Context in Server Functions

```typescript
import { createServerFn } from '@tanstack/react-start'

export const getTodos = createServerFn()
  .middleware([loggingMiddleware])
  .handler(async ({ context }) => {
    // Access db and user from context
    return context.db
      .prepare('SELECT * FROM todos WHERE user_id = ?')
      .bind(context.user.id)
      .all()
  })
```

#### Client-to-Server Context

You can send data from client middleware to server middleware:

```typescript
const clientMiddleware = createMiddleware({ type: 'function' })
  .client(async ({ next, context }) => {
    return next({
      sendContext: {
        workspaceId: context.selectedWorkspaceId,
      },
    })
  })

const serverMiddleware = createMiddleware({ type: 'function' })
  .middleware([clientMiddleware])
  .server(async ({ next, context }) => {
    // workspaceId is now available on server
    console.log(context.workspaceId)
    return next()
  })
```

### 2. Router Context (TanStack Router)

This is TanStack Router's context system, used primarily with **loaders** for dependency injection.

#### What Problem It Solves

Router context allows you to inject dependencies (services, data clients, helper functions) that can be accessed in route loaders and components without direct imports. It's especially useful for:

- Making data fetching clients available to all routes
- Injecting React context/hooks values into loaders (which can't use hooks directly)
- Dependency injection for testability
- Breadcrumb accumulation from matched routes
- Dynamic SEO tag management per route

#### Use Cases

- **TanStack Query integration**: Provide a QueryClient to all routes
- **API clients**: Inject a typed API client
- **Breadcrumbs**: Accumulate breadcrumb data from matched routes
- **Meta tags**: Dynamic SEO tag management per route

#### Setup

```typescript
// src/router.tsx
import { createRootRouteWithContext, createRouter } from '@tanstack/react-router'

interface MyRouterContext {
  queryClient: QueryClient
  fetchApi: <T>(endpoint: string) => Promise<T>
}

const rootRoute = createRootRouteWithContext<MyRouterContext>()({
  component: App,
})

const queryClient = new QueryClient()

const router = createRouter({
  routeTree: rootRoute,
  context: {
    queryClient,
    fetchApi: async (endpoint) => {
      const res = await fetch(`/api${endpoint}`)
      return res.json()
    },
  },
})
```

#### Using Context in Loaders

```typescript
// src/routes/posts.tsx
export const Route = createFileRoute('/posts')({
  loader: ({ context }) => {
    // Access QueryClient from context
    return context.queryClient.ensureQueryData({
      queryKey: ['posts'],
      queryFn: () => context.fetchApi('/posts'),
    })
  },
})
```

#### Modifying Context Per Route

```typescript
// src/routes/todos.tsx
export const Route = createFileRoute('/todos')({
  beforeLoad: () => {
    return { todosFilter: 'all' }
  },
  loader: ({ context }) => {
    // Has both root context (queryClient) and route-specific context (todosFilter)
    context.queryClient
    context.todosFilter
  },
})
```

### Context Comparison

| Aspect | Request Context | Router Context |
|--------|----------------|----------------|
| **Layer** | Server-side middleware/handler | Router/loader layer |
| **Primary use** | Middleware chain, server functions | Loaders, components |
| **Access in loaders** | Via `context` parameter | Via `context` parameter |
| **Access in server fns** | Via `context` parameter | Not directly available |
| **Access in components** | Via `useServerFn` return | Via `useRouter` or `Route.useLoaderData` |

**Key insight**: In a server-side loader, you receive both contexts merged together. The Request Context flows from `handler.fetch(request, { context })` through middleware to loaders. Router Context is set up at router creation time and flows through the route matching process.

## How Context Flows

The flow starts with YOU creating context in `src/worker.ts`:

```
1. You write: src/worker.ts → fetch(request) → handler.fetch(request, { context: YOUR_CONTEXT })
       ↓
2. TanStack Start: runWithStartContext() stores context in AsyncLocalStorage
       ↓
3. Global Request Middleware: Receives context in { context } parameter
       ↓
4. Route Middleware: Receives accumulated context
       ↓
5. Server Functions: Receives final context in handler
       ↓
6. Loaders: Receives context for data fetching
```

From `refs/tan-start/packages/start-server-core/src/createStartHandler.ts:284-308`:

```typescript
// Context from YOUR server entry flows through middleware to server functions
const serverFnHandler = async ({ context }: TODO) => {
  return runWithStartContext(
    {
      getRouter,
      startOptions: requestStartOptions,
      contextAfterGlobalMiddlewares: context,  // ← Your context arrives here
      request,
      executedRequestMiddlewares,
    },
    () =>
      handleServerAction({
        request,
        context: requestOpts?.context,  // ← And is passed here too
        serverFnId,
      }),
  )
}
```

The key insight: **YOU create the context in step 1**, and TanStack Start propagates it through steps 2-6.

## Reference Patterns

### crrbuis Pattern (React Router, not TanStack Start)

The crrbuis saas template uses a different pattern with React Router and Hono. Note that this is **not** TanStack Start - it's React Router v7 with Hono as the router layer. However, it demonstrates the same concept: creating context per-request.

**File**: `refs/crrbuis/workers/app.ts`

```typescript
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    
    // Initialize services per request (YOU create them)
    const d1SessionService = createD1SessionService({ d1: env.D1, request })
    const repository = createRepository({ db: d1SessionService.getSession() })
    const authService = createAuthService({ db: d1SessionService.getSession() })
    
    // Set up React Router with your context
    hono.all("*", async (c) => {
      const context = new ReactRouter.RouterContextProvider()
      context.set(RequestContext, {
        env,
        authService,
        repository,
        session: await authService.api.getSession({ headers: c.req.raw.headers }),
      })
      const requestHandler = ReactRouter.createRequestHandler(
        () => import("virtual:react-router/server-build"),
        import.meta.env.MODE,
      )
      return requestHandler(c.req.raw, context)
    })
    
    return await hono.fetch(request, env, ctx)
  },
}
```

Note: crrbuis uses `ReactRouter.RouterContextProvider` which is React Router's context mechanism, not TanStack Start's request context.

### TanStack Start i18n Pattern

The solid-start-i18n-paraglide example shows wrapping the default handler:

**File**: `refs/tan-start/examples/solid/start-i18n-paraglide/src/server.ts`

```typescript
import { paraglideMiddleware } from './paraglide/server.js'
import handler from '@tanstack/solid-start/server-entry'

export default {
  fetch(req: Request): Promise<Response> {
    return paraglideMiddleware(req, ({ request }) => handler.fetch(request))
  },
}
```

## Recommended Project Structure

### Proposed File Layout

```
src/
├── lib/
│   └── middleware/
│       ├── auth-middleware.ts
│       └── logging-middleware.ts
├── worker.ts    # Custom worker entry point with context type definition
└── start.ts     # Start instance configuration
```

The ServerContext type is defined directly in `worker.ts` alongside the entry point.

### Implementation: src/lib/server-context.ts

```typescript
import type { D1Database, KVNamespace } from '@cloudflare/workers-types'
import type { AuthService } from './services/auth'
import type { Repository } from './repository'

export interface ServerContext {
  env: {
    D1: D1Database
    KV: KVNamespace
  }
  db: D1Database
  authService: AuthService
  repository: Repository
  user?: {
    id: string
    email: string
    sessionId: string
  }
}

declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: ServerContext
    }
  }
}
```

### Implementation: src/worker.ts

This is where YOU create the ServerContext per request. The file is your Cloudflare Workers entry point.

**File**: `src/worker.ts`

```typescript
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import type { D1Database, KVNamespace } from '@cloudflare/workers-types'

// Define your ServerContext type
interface ServerContext {
  env: {
    D1: D1Database
    KV: KVNamespace
  }
  repository: {
    users: {
      findById: (id: string) => Promise<User | null>
      findByEmail: (email: string) => Promise<User | null>
    }
    sessions: {
      create: (userId: string) => Promise<Session>
      validate: (token: string) => Promise<Session | null>
    }
  }
  auth: {
    getCurrentUser: (request: Request) => Promise<User | null>
    requireUser: (request: Request) => Promise<User>
  }
  user?: {
    id: string
    email: string
    sessionId: string
  }
}

// Module augmentation for type safety
declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: ServerContext
    }
  }
}

// Helper to create repository (called per request)
function createRepository(env: ServerContext['env']) {
  const db = env.D1
  return {
    users: {
      findById: async (id: string) => {
        const result = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first()
        return result as User | null
      },
      findByEmail: async (email: string) => {
        const result = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first()
        return result as User | null
      },
    },
    sessions: {
      create: async (userId: string) => {
        const token = crypto.randomUUID()
        await db.prepare('INSERT INTO sessions (id, user_id, created_at) VALUES (?, ?, ?)').bind(token, userId, Date.now()).run()
        return { token, userId } as Session
      },
      validate: async (token: string) => {
        const result = await db.prepare('SELECT * FROM sessions WHERE id = ?').bind(token).first()
        return result as Session | null
      },
    },
  }
}

// Helper to create auth service (called per request)
function createAuth(repository: ServerContext['repository']) {
  return {
    getCurrentUser: async (request: Request): Promise<User | null> => {
      const cookie = request.headers.get('cookie')
      if (!cookie) return null
      
      const sessionToken = cookie.split(';').find(c => c.trim().startsWith('session='))?.split('=')[1]
      if (!sessionToken) return null
      
      const session = await repository.sessions.validate(sessionToken)
      if (!session) return null
      
      return repository.users.findById(session.userId)
    },
    requireUser: async (request: Request): Promise<User> => {
      const user = await createAuth(repository).getCurrentUser(request)
      if (!user) {
        throw new Response('Unauthorized', { status: 401 })
      }
      return user
    },
  }
}

export default createServerEntry({
  async fetch(request: Request): Promise<Response> {
    // YOU create the context HERE - this is your responsibility
    // Access Cloudflare bindings from process.env (injected by Wrangler)
    const env = {
      D1: process.env.D1 as unknown as D1Database,
      KV: process.env.KV as unknown as KVNamespace,
    }
    
    // Create request-scoped services
    const repository = createRepository(env)
    const auth = createAuth(repository)
    
    // Optionally get current user
    const user = await auth.getCurrentUser(request)
    
    const context: ServerContext = {
      env,
      repository,
      auth,
      user: user ? { id: user.id, email: user.email, sessionId: '' } : undefined,
    }
    
    // Pass context to TanStack Start handler
    return handler.fetch(request, { context })
  },
})

// Type definitions for clarity
interface User {
  id: string
  email: string
  created_at: number
}

interface Session {
  token: string
  userId: string
}
```

### Implementation: src/start.ts

```typescript
import { createStart } from '@tanstack/react-start'
import { authMiddleware } from '@/lib/middleware/auth-middleware'

export const startInstance = createStart(() => ({
  requestMiddleware: [authMiddleware],
}))
```

Note: The `{ context }` in the second parameter is not destructuring - it's the `RequestOptions` object with a `context` property. The context you pass here is what flows to middleware and loaders.

### Implementation: src/start.ts

```typescript
import { createStart } from '@tanstack/react-start'
import { authMiddleware } from '@/lib/middleware/auth-middleware'

export const startInstance = createStart(() => ({
  requestMiddleware: [authMiddleware],
}))
```

## Best Practices

### 1. Keep Context Minimal

Only include data that's genuinely needed across multiple middleware/loaders. Avoid putting large objects or data that could be computed on-demand.

```typescript
// Good: Minimal context
context: {
  user: { id: '123', email: 'user@example.com' },
  db: database,
}

// Avoid: Overly broad context
context: {
  user: entireUserRecord, // May contain unnecessary fields
  allSettings: settingsObject, // May not be needed everywhere
}
```

### 2. Initialize Services Once Per Request

Create services in the server entry, not in individual middleware handlers:

```typescript
// src/worker.ts
export default createServerEntry({
  async fetch(request: Request): Promise<Response> {
    // Create services HERE, per request
    const env = {
      D1: process.env.D1 as unknown as D1Database,
      KV: process.env.KV as unknown as KVNamespace,
    }
    const repository = createRepository(env)
    const authService = createAuthService({ repository })
    
    const context: ServerContext = {
      env,
      repository,
      auth: authService,
      user: await authService.getCurrentUser(request),
    }
    
    return handler.fetch(request, { context })
  },
})
```

### 3. Use Module Augmentation for Type Safety

Always type your context using module augmentation:

```typescript
declare module '@tanstack/react-start' {
  interface Register {
    server: {
      requestContext: YourContextType
    }
  }
}
```

This provides end-to-end TypeScript safety throughout your middleware and loaders.

### 4. Handle Context in Middleware

Access and extend context in middleware for downstream handlers:

```typescript
const userLoader = createMiddleware({ type: 'function' })
  .server(async ({ next, context }) => {
    const user = await context.authService.getCurrentUser(context.db)
    return next({
      context: {
        ...context,
        user,
      },
    })
  })
```

### 5. Validate Client-Sent Context

If accepting context from the client, validate it before use:

```typescript
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'

const clientContext = createMiddleware({ type: 'function' })
  .client(async ({ next, context }) => {
    return next({
      sendContext: {
        workspaceId: context.workspaceId,
      },
    })
  })
  .server(async ({ next, data, context }) => {
    // Validate before using
    const validatedWorkspaceId = z.string().uuid().parse(context.workspaceId)
    return next()
  })
```

### 6. Organize Middleware by Concern

Group related middleware and use dependency composition:

```typescript
const authMiddleware = createMiddleware()
  .middleware([loggingMiddleware])  // Logging first
  .server(async ({ next, context }) => {
    // Auth logic
    return next({ context: { user } })
  })

const apiMiddleware = createMiddleware()
  .middleware([authMiddleware])  // Auth required
  .server(async ({ next, context }) => {
    // API-specific logic
    return next()
  })
```

## Accessing Context

### In Middleware

```typescript
createMiddleware({ type: 'function' })
  .server(async ({ context, next }) => {
    // Access context
    context.user
    context.db
    return next()
  })
```

### In Server Functions

```typescript
createServerFn()
  .handler(async ({ context }) => {
    // Access context
    return context.db.query('SELECT * FROM users')
  })
```

### In Loaders

```typescript
createFileRoute('/posts')({
  loader: async ({ context }) => {
    // Access context
    return context.repository.getPosts(context.user.id)
  },
})
```

### In Global Middleware

Global middleware in `src/start.ts` also receives context:

```typescript
export const startInstance = createStart(() => ({
  requestMiddleware: [
    createMiddleware()
      .server(async ({ next, context }) => {
        // All requests go through this
        return next({ context: { requestId: crypto.randomUUID() } })
      })
  ],
}))
```

## Related Files

- `refs/tan-start/docs/start/framework/react/guide/server-entry-point.md` - Official docs
- `refs/tan-start/docs/start/framework/react/guide/middleware.md` - Middleware docs
- `refs/tan-start/docs/start/framework/react/guide/server-functions.md` - Server functions docs
- `refs/tan-start/packages/start-server-core/src/createStartHandler.ts` - Implementation of context propagation
- `refs/tan-start/packages/start-storage-context/src/async-local-storage.ts` - AsyncLocalStorage implementation
- `refs/tan-start/packages/react-start/src/default-entry/server.ts` - Default server entry point
- `refs/tan-start/examples/solid/start-i18n-paraglide/src/server.ts` - Example of wrapping the handler

## Default vs Custom Server Entry

### Default Entry Point

If you don't create `src/worker.ts`, TanStack Start uses its default entry point:

**File**: `refs/tan-start/packages/react-start/src/default-entry/server.ts`

```typescript
import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'

const fetch = createStartHandler(defaultStreamHandler)

export default createServerEntry({ fetch })
```

With the default, **context is empty** (`{}`) and you cannot pass custom data to middleware/loaders.

### Custom Entry Point (Recommended for Context)

When you need context, create `src/worker.ts`:

```typescript
import handler, { createServerEntry } from '@tanstack/react-start/server-entry'

export default createServerEntry({
  async fetch(request: Request): Promise<Response> {
    // YOU create and pass context here
    const context = { user: await getUser(request), db: process.env.D1 }
    return handler.fetch(request, { context })
  },
})
```

**This is the only way to provide custom context to your middleware and loaders.**
