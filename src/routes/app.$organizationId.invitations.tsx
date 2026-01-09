import * as React from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { AlertCircle } from "lucide-react";
import * as z from "zod";
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
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import * as Domain from "@/lib/domain";

const getLoaderData = createServerFn({ method: "GET" })
  .inputValidator((data: { organizationId: string }) => data)
  .handler(async ({ data, context: { authService } }) => {
    const request = getRequest();
    const { success: canManageInvitations } =
      await authService.api.hasPermission({
        headers: request.headers,
        body: {
          organizationId: data.organizationId,
          permissions: { invitation: ["create", "cancel"] },
        },
      });
    const invitations = await authService.api.listInvitations({
      headers: request.headers,
      query: { organizationId: data.organizationId },
    });
    return { canManageInvitations, invitations };
  });

export const Route = createFileRoute("/app/$organizationId/invitations")({
  loader: ({ params: data }) => getLoaderData({ data }),
  component: RouteComponent,
});

const cancelInvitation = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ invitationId: z.coerce.number().int().positive() }),
  )
  .handler(async ({ data, context: { authService } }) => {
    const request = getRequest();
    await authService.api.cancelInvitation({
      headers: request.headers,
      body: { invitationId: String(data.invitationId) },
    });
    return { success: true };
  });

function RouteComponent() {
  const { canManageInvitations, invitations } = Route.useLoaderData();
  const { organizationId } = Route.useParams();
  const cancelInvitationFn = useServerFn(cancelInvitation);

  return (
    <div className="flex flex-col gap-8 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Invitations</h1>
        <p className="text-muted-foreground text-sm">
          Invite new members and manage your invitations.
        </p>
      </header>

      {canManageInvitations && <InviteForm organizationId={organizationId} />}

      <Card>
        <CardHeader>
          <CardTitle>Invitations</CardTitle>
          <CardDescription>
            Review and manage invitations sent for this organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invitations.length > 0 ? (
            <div aria-label="Organization invitations">
              {invitations.map((invitation) => (
                <InvitationItem
                  key={invitation.id}
                  invitation={invitation}
                  canManageInvitations={canManageInvitations}
                  cancelInvitationFn={cancelInvitationFn}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No invitations have been sent for this organization yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const inviteSchema = z.object({
  organizationId: z.string(),
  emails: z
    .string()
    .transform((v) =>
      v
        .split(",")
        .map((i) => i.trim())
        .filter(Boolean),
    )
    .refine(
      (emails) => emails.every((email) => z.email().safeParse(email).success),
      "Please provide valid email addresses.",
    )
    .refine((emails) => emails.length >= 1, "At least one email is required")
    .refine((emails) => emails.length <= 10, "Maximum 10 emails allowed"),
  role: Domain.MemberRole.extract(
    ["member", "admin"],
    "Role must be Member or Admin.",
  ),
});

const invite = createServerFn({ method: "POST" })
  .inputValidator((data: z.input<typeof inviteSchema>) => data)
  .handler(async ({ data, context: { authService, repository } }) => {
    const parseResult = inviteSchema.safeParse(data);
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
    try {
      const request = getRequest();
      for (const email of parseResult.data.emails) {
        const result = await authService.api.createInvitation({
          headers: request.headers,
          body: {
            email,
            role: parseResult.data.role,
            organizationId: String(parseResult.data.organizationId),
            resend: true,
          },
        });
        // Workaround for better-auth createInvitation role bug.
        // Occurs when a pending invitation exists and a new invitation is created with a different role.
        if (result.role !== parseResult.data.role) {
          console.log(
            `Applying workaround for better-auth createInvitation role bug: expected role ${parseResult.data.role}, got ${String(result.role)} for invitation ${String(result.id)}`,
          );
          await repository.updateInvitationRole({
            invitationId: Number(result.id),
            role: parseResult.data.role,
          });
        }
      }
      return { success: true };
    } catch (error: unknown) {
      return {
        success: false,
        errorMap: {
          onSubmit: {
            form: `Failed to invite: ${
              error instanceof Error ? error.message : String(error)
            }`,
            fields: {},
          },
        },
      };
    }
  });

function InviteForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const actionServerFn = useServerFn(invite);
  const action = useMutation({
    mutationFn: async (data: z.input<typeof inviteSchema>) =>
      actionServerFn({ data }),
    onSuccess: (result) => {
      if (result.success) {
        form.reset();
        void router.invalidate();
      } else {
        form.setErrorMap(result.errorMap);
      }
    },
  });

  const form = useForm({
    defaultValues: {
      organizationId,
      emails: "",
      role: "member" as Extract<Domain.MemberRole, "member" | "admin">,
    },
    validators: {
      onSubmit: inviteSchema,
    },
    onSubmit: ({ value }) => {
      console.log(`onSubmit: ${JSON.stringify({ value })}`, { value });
      // action.mutate({ organizationId, ...value });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invite New Members</CardTitle>
        <CardDescription>
          Enter email addresses separated by commas to send invitations.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <FieldGroup>
            {action.data?.errorMap && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  {action.data.errorMap.onSubmit.form}
                </AlertDescription>
              </Alert>
            )}
            <form.Field
              name="emails"
              children={(field) => {
                const isInvalid = field.state.meta.errors.length > 0;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      Email Addresses
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => {
                        field.handleChange(e.target.value);
                      }}
                      placeholder="user1@example.com, user2@example.com"
                      aria-invalid={isInvalid}
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                );
              }}
            />
            <form.Field
              name="role"
              children={(field) => {
                const isInvalid = field.state.meta.errors.length > 0;
                return (
                  <Field data-invalid={isInvalid} className="w-fit">
                    <FieldLabel htmlFor={field.name}>Role</FieldLabel>
                    <Select
                      value={field.state.value}
                      onValueChange={(value) => {
                        if (value) field.handleChange(value);
                      }}
                    >
                      <SelectTrigger className="capitalize">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                );
              }}
            />
            <form.Subscribe
              selector={(state) => state.canSubmit}
              children={(canSubmit) => (
                <Button
                  type="submit"
                  disabled={!canSubmit || action.isPending}
                  className="self-end"
                >
                  {action.isPending ? "..." : "Invite"}
                </Button>
              )}
            />
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  );
}

function InvitationItem({
  invitation,
  canManageInvitations,
  cancelInvitationFn,
}: {
  invitation: NonNullable<
    Awaited<ReturnType<typeof getLoaderData>>["invitations"]
  >[number];
  canManageInvitations: boolean;
  cancelInvitationFn: ReturnType<typeof useServerFn<typeof cancelInvitation>>;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const handleCancel = async () => {
    setPending(true);
    try {
      await cancelInvitationFn({
        data: { invitationId: Number(invitation.id) },
      });
      void router.invalidate();
    } finally {
      setPending(false);
    }
  };

  return (
    <Item size="sm" className="gap-4 px-0">
      <ItemContent>
        <ItemTitle>{invitation.email}</ItemTitle>
        <ItemDescription>
          {invitation.role} — {invitation.status}
          {invitation.status === "pending" && (
            <>
              <br />
              <span className="text-xs">
                Expires:{" "}
                {new Date(invitation.expiresAt)
                  .toISOString()
                  .replace("T", " ")
                  .slice(0, 16)}{" "}
                UTC
              </span>
            </>
          )}
        </ItemDescription>
      </ItemContent>
      {canManageInvitations && invitation.status === "pending" && (
        <ItemActions>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Cancel invitation for ${invitation.email}`}
            disabled={pending}
            onClick={() => {
              void handleCancel();
            }}
          >
            Cancel
          </Button>
        </ItemActions>
      )}
    </Item>
  );
}
