# Hybrid Session Management: Better-Auth + TanStack Start

## Overview

This approach combines Better-Auth's secure cookie-based session management with TanStack Start's middleware and server functions for comprehensive authentication.

## Architecture

- **Better-Auth**: Handles session tokens, cookie management, and authentication logic
- **TanStack Start**: Provides middleware validation, server function integration, and route protection

## Integration Points

1. Better-Auth stores session tokens in HTTP-only cookies
2. TanStack Start middleware validates sessions on each request
3. Server functions access validated session from context
4. Routes use `beforeLoad` for protection

## Implementation

### 1. Better-Auth Configuration

```tsx
import { betterAuth } from "better-auth"
import { d1Adapter } from "./lib/d1-adapter"

export const auth = betterAuth({
  database: d1Adapter,
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60
    }
  },
  advanced: {
    cookiePrefix: "app",
    useSecureCookies: process.env.NODE_ENV === "production"
  }
})
```

### 2. Middleware Session Validation

```tsx
import { createMiddleware, getRequestHeaders } from "@tanstack/react-start"
import { auth } from "./lib/auth-service"

export const validateSession = createMiddleware().server(async ({ next }) => {
  const session = await auth.api.getSession({
    headers: await getRequestHeaders()
  })
  
  if (!session) {
    return next({ context: { user: null, session: null } })
  }
  
  return next({ 
    context: { 
      user: session.user, 
      session,
      userId: session.user.id 
    } 
  })
})
```

### 3. Configure Start Instance with Middleware

```tsx
import { createStart } from "@tanstack/react-start"
import { validateSession } from "./middleware/auth-middleware"

export const startInstance = createStart(() => ({
  requestMiddleware: [validateSession]
}))
```

### 4. Authenticated Server Functions

```tsx
import { createServerFn } from "@tanstack/react-start"
import { auth } from "./lib/auth-service"

export const loginFn = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const result = await auth.api.signInEmail({
      body: data
    })
    
    if (result.error) {
      return { error: result.error.message }
    }
    
    return { success: true, user: result.user }
  })

export const logoutFn = createServerFn({ method: "POST" })
  .handler(async () => {
    await auth.api.signOut({
      headers: await getRequestHeaders()
    })
    return { success: true }
  })

export const createTodoFn = createServerFn({ method: "POST" })
  .inputValidator((data: { title: string }) => data)
  .middleware([validateSession])
  .handler(async ({ data, context }) => {
    if (!context.user) {
      throw new Error("Unauthorized")
    }
    
    return await db.todo.create({
      data: { 
        title: data.title, 
        userId: context.user.id 
      }
    })
  })

export const getTodosFn = createServerFn({ method: "GET" })
  .middleware([validateSession])
  .handler(async ({ context }) => {
    if (!context.user) {
      throw new Error("Unauthorized")
    }
    
    return await db.todo.findMany({
      where: { userId: context.user.id }
    })
  })
```

### 5. Route-Level Protection

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router"
import { auth } from "../../lib/auth-service"
import { getRequestHeaders } from "@tanstack/react-start"

export const Route = createFileRoute('/_authed/dashboard')({
  beforeLoad: async () => {
    const session = await auth.api.getSession({
      headers: await getRequestHeaders()
    })
    
    if (!session) {
      throw redirect({ to: '/login' })
    }
    
    return { user: session.user }
  },
  loader: async ({ context }) => {
    const todos = await getTodosFn()
    return { todos }
  }
})
```

### 6. Client-Side Usage

```tsx
import { useMutation, useQuery } from "@tanstack/react-query"
import { loginFn, logoutFn, getTodosFn, createTodoFn } from "../lib/auth-server"

export function LoginForm() {
  const login = useMutation({ mutationFn: loginFn })
  
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    login.mutate({
      email: formData.get("email") as string,
      password: formData.get("password") as string
    })
  }
  
  return (
    <form onSubmit={handleSubmit}>
      <input name="email" type="email" />
      <input name="password" type="password" />
      <button type="submit">Login</button>
    </form>
  )
}

export function Dashboard() {
  const { data: todos } = useQuery({ queryKey: ["todos"], queryFn: getTodosFn })
  const createTodo = useMutation({ mutationFn: createTodoFn })
  
  return (
    <div>
      <button onClick={() => createTodo.mutate({ title: "New Task" })}>
        Add Todo
      </button>
      {todos?.map(todo => <div key={todo.id}>{todo.title}</div>)}
    </div>
  )
}
```

## Security Considerations

### Cookie Security

- `httpOnly: true` - Prevents JavaScript access to session cookies
- `secure: true` - Ensures cookies are only sent over HTTPS in production
- `sameSite: 'lax'` - Provides CSRF protection
- Signed cookies - Better-Auth signs cookies to prevent tampering

### Session Validation

- Always validate sessions on the server side
- Never trust client-side session data
- Use middleware for consistent validation across all routes
- Implement session revocation on password changes
- Rate-limit login attempts to prevent brute force attacks

### Performance Optimization

- Enable cookie cache in Better-Auth to reduce database queries
- Use short-lived cache duration (5-10 minutes)
- Implement session refresh on user activity
- Consider implementing token rotation for enhanced security

## Benefits

1. **Security**: HTTP-only cookies prevent XSS attacks, proper validation prevents CSRF
2. **Performance**: Cookie caching reduces database load
3. **Type Safety**: TypeScript integration throughout the stack
4. **Developer Experience**: Middleware provides clean separation of concerns
5. **Flexibility**: Easy to add additional auth providers (OAuth, magic links, etc.)

## Cookie Structure

Better-Auth creates the following cookies:

- `app.session_token` - The primary session identifier
- `app.session_data` - Cached session data (if cookie cache enabled)
- `app.dont_remember` - Flag for session-only cookies (if rememberMe is disabled)

All cookies are prefixed with `app` (configurable) and are HTTP-only and secure in production.

## Session Flow

1. User logs in via `loginFn`
2. Better-Auth validates credentials and creates session
3. Better-Auth sets HTTP-only cookies containing session token
4. On subsequent requests, middleware validates session token
5. Validated session is available in context for server functions and routes
6. User logs out via `logoutFn`, session is revoked and cookies cleared
