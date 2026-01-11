Here is the updated Markdown document, focusing on the implementation within a **TanStack Form** field context.

***

# Fixing Playwright Race Conditions: Safe Hydration with `useHydrated`

## The Issue: The Hydration Gap

In Server-Side Rendered (SSR) applications (like TanStack Start), the server sends HTML that includes your form fields. These inputs appear visible to the user (and Playwright) immediately.

However, until the JavaScript bundle downloads and React "hydrates" the page, the event handlers managed by TanStack Form (like `handleChange`, `handleBlur`, and `handleSubmit`) are **not attached** to the DOM elements.

If Playwright types into an input or clicks submit during this gap:
1.  **Input Loss:** Keystrokes may be lost when React re-renders during hydration.
2.  **Native Submission:** Hitting "Enter" or clicking "Submit" triggers a native browser form POST (reloading the page) instead of the intended TanStack Form submission handler.

## The Solution: Hydration Locking in Form Fields

We use the `useHydrated` hook to force the `disabled` state on form inputs until the application is interactive. This ensures that users (and tests) cannot interact with the form until TanStack Form is fully in control.

### Implementation

Call `useHydrated` in your component and pass the state into your `form.Field` render prop.

```tsx
import { useHydrated } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';

export function LoginForm() {
  // 1. Get hydration state
  // Returns false on Server & during initial Hydration pass
  // Returns true only after the app is interactive
  const isHydrated = useHydrated();

  const form = useForm({
    // ... form configuration
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Field
        name="email"
        children={(field) => (
          <>
            <Label htmlFor={field.name}>Email</Label>
            {/* 2. Lock the input using !isHydrated */}
            <Input
              id={field.name}
              name={field.name}
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
              disabled={!isHydrated} 
            />
          </>
        )}
      />

      <form.Subscribe selector={(state) => state.canSubmit}>
        {(canSubmit) => (
          <Button 
            type="submit" 
            // 3. Lock the submit button too
            disabled={!isHydrated || !canSubmit}
          >
            Sign In
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}
```

### Why checking `field` properties isn't enough

You might be tempted to check if `field.handleChange` exists to determine if the form is ready. **This does not work.**

*   **Server Execution:** When TanStack Start runs on the server, `useForm` creates a real form instance. `field.handleChange` is a defined function in the server's memory.
*   **The Trap:** If you used `disabled={!field.handleChange}`, the input would render as **enabled** in the HTML sent from the server.
*   **The Result:** The race condition would persist. The input would be clickable before the client-side JavaScript has actually attached the listener to the DOM.

By using `!isHydrated`, we explicitly synchronize the UI state with the React lifecycle, guaranteeing that the form is disabled until the moment `useEffect` runs and the application is safe to use.