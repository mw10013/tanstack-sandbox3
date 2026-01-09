import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { AlertCircle } from "lucide-react";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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

export const Route = createFileRoute("/login")({
  component: RouteComponent,
});

const loginSchema = z.object({
  email: z.email(),
});

export const login = createServerFn({
  method: "POST",
})
  .inputValidator(loginSchema)
  .handler(async ({ data, context: { authService, env } }) => {
    const parseResult = loginSchema.safeParse(data);
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

function RouteComponent() {
  const loginServerFn = useServerFn(login);
  const loginMutation = useMutation({
    mutationFn: async (data: z.input<typeof loginSchema>) => loginServerFn({ data }),
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
      await loginMutation.mutateAsync(value);
    },
  });

  if (loginMutation.data?.success) {
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
        {loginMutation.data.magicLink && (
          <div className="mt-4">
            <a href={loginMutation.data.magicLink} className="block">
              {loginMutation.data.magicLink}
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
              {loginMutation.data?.errorMap && (
                <Alert variant="destructive">
                  <AlertCircle className="size-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>
                    {loginMutation.data.errorMap.onSubmit.form}
                  </AlertDescription>
                </Alert>
              )}
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
                    disabled={!canSubmit || loginMutation.isPending}
                    className="w-full"
                  >
                    {isSubmitting || loginMutation.isPending
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
