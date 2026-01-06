import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const actionSchema = z.object({
  email: z.email(),
});

export const actionServerFn = createServerFn({
  method: "POST",
})
  .inputValidator((data: z.input<typeof actionSchema>) => data)
  .handler(async ({ data, context: { authService, env } }) => {
    const parseResult = actionSchema.safeParse(data);
    if (!parseResult.success) {
      const { formErrors, fieldErrors } = z.flattenError(parseResult.error);
      const errorMap = {
        onSubmit: {
          ...(formErrors.length > 0 ? { form: formErrors.join(", ") } : {}),
          fields: Object.entries(fieldErrors).reduce<
            Record<string, { message: string }[]>
          >((acc, [key, messages]) => {
            acc[key] = messages.map((message) => ({ message }));
            return acc;
          }, {}),
        },
      };
      return { success: false, errorMap };
    }
    const request = getRequest();
    const result = await authService.api.signInMagicLink({
      headers: request.headers,
      body: { email: parseResult.data.email, callbackURL: "/magic-link" },
    });
    if (!result.status) {
      const errorMap = {
        onSubmit: {
          form: "Failed to send magic link. Please try again.",
          fields: {},
        },
      };
      return { success: false, errorMap };
    }
    const magicLink =
      env.DEMO_MODE === "true"
        ? ((await env.KV.get(`demo:magicLink`)) ?? undefined)
        : undefined;
    console.log("magicLink", magicLink);
    return { success: true, magicLink };
  });

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

function RouteComponent() {
  const actionFn = useServerFn(actionServerFn);
  const action = useMutation({
    mutationFn: async (data: z.input<typeof actionSchema>) => actionFn({ data }),
    onSuccess: (result) => {
      if (!result.success) {
        form.setErrorMap(result.errorMap);
      }
    },
  });
  const form = useForm({
    defaultValues: {
      email: "",
    },
    onSubmit: async ({ value }) => {
      console.log(`onSubmit: value: ${JSON.stringify(value)}`);
      await action.mutateAsync(value);
    },
  });

  if (action.data?.success) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Check your email</CardTitle>
            <CardDescription>
              If an account exists for that email, a magic sign-in link has been
              sent.
            </CardDescription>
          </CardHeader>
        </Card>
        {action.data.magicLink && (
          <div className="mt-4">
            <a href={action.data.magicLink} className="block">
              {action.data.magicLink}
            </a>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in / Sign up</CardTitle>
          <CardDescription>
            Enter your email to receive a magic sign-in link
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            id="login-form"
            method="post"
            onSubmit={(e) => {
              e.preventDefault();
              void form.handleSubmit();
            }}
          >
            <FieldGroup>
              <form.Field
                name="email"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        // type="email"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => {
                          field.handleChange(e.target.value);
                        }}
                        placeholder="m@example.com"
                        aria-invalid={isInvalid}
                      />
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  );
                }}
              />
              <form.Subscribe
                selector={(formState) => [
                  formState.canSubmit,
                  formState.isSubmitting,
                ]}
              >
                {([canSubmit, isSubmitting]) => (
                  <Button
                    type="submit"
                    form="login-form"
                    disabled={!canSubmit || action.isPending}
                    className="w-full"
                  >
                    {isSubmitting || action.isPending
                      ? "..."
                      : "Send magic link"}
                  </Button>
                )}
              </form.Subscribe>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
