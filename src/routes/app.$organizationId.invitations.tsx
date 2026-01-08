import * as React from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import * as z from "zod";
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

const inviteSchema = z.object({
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

type InviteFormValues = z.input<typeof inviteSchema>;

const getLoaderData = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      organizationId: z.coerce.number().int().positive(),
    }),
  )
  .handler(async ({ data, context: { authService } }) => {
    const request = getRequest();
    const { success: canManageInvitations } =
      await authService.api.hasPermission({
        headers: request.headers,
        body: {
          organizationId: String(data.organizationId),
          permissions: { invitation: ["create", "cancel"] },
        },
      });
    const invitations = await authService.api.listInvitations({
      headers: request.headers,
      query: { organizationId: String(data.organizationId) },
    });
    return { canManageInvitations, invitations };
  });

const createInvitation = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      organizationId: z.coerce.number().int().positive(),
      email: z.email(),
      role: Domain.MemberRole,
    }),
  )
  .handler(async ({ data, context: { authService, repository } }) => {
    const request = getRequest();
    const result = await authService.api.createInvitation({
      headers: request.headers,
      body: {
        email: data.email,
        role: data.role,
        organizationId: String(data.organizationId),
        resend: true,
      },
    });
    if (result.role !== data.role) {
      await repository.updateInvitationRole({
        invitationId: Number(result.id),
        role: data.role,
      });
    }
    return { success: true };
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

export const Route = createFileRoute("/app/$organizationId/invitations")({
  loader: async ({ params }) => {
    const organizationId = Number(params.organizationId);
    const result = await getLoaderData({ data: { organizationId } });
    return result;
  },
  component: RouteComponent,
});

function RouteComponent() {
  const data = Route.useLoaderData();
  const params = Route.useParams();
  const cancelInvitationFn = useServerFn(cancelInvitation);
  const organizationId = Number(params.organizationId);

  return (
    <div className="flex flex-col gap-8 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Invitations</h1>
        <p className="text-muted-foreground text-sm">
          Invite new members and manage your invitations.
        </p>
      </header>

      {data.canManageInvitations && (
        <InviteForm organizationId={organizationId} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Invitations</CardTitle>
          <CardDescription>
            Review and manage invitations sent for this organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.invitations.length > 0 ? (
            <div aria-label="Organization invitations">
              {data.invitations.map((invitation) => (
                <InvitationItem
                  key={invitation.id}
                  invitation={invitation}
                  canManageInvitations={data.canManageInvitations}
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

function InviteForm({ organizationId }: { organizationId: number }) {
  const router = useRouter();
  const createInvitationServerFn = useServerFn(createInvitation);
  const [error, setError] = React.useState<string | null>(null);
  const createInvitationMutation = useMutation({
    mutationFn: async (data: InviteFormValues) => {
      const emails = data.emails
        .split(",")
        .map((i) => i.trim())
        .filter(Boolean);
      await Promise.all(
        emails.map((email: string) =>
          createInvitationServerFn({
            data: {
              organizationId,
              email,
              role: data.role,
            },
          }),
        ),
      );
    },
    onSuccess: () => {
      form.reset();
      void router.invalidate();
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const form = useForm({
    defaultValues: {
      emails: "",
      role: "member" as Domain.MemberRole,
    },
    onSubmit: async ({ value }) => {
      setError(null);
      await createInvitationMutation.mutateAsync(value);
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
            {error && <div className="text-destructive text-sm">{error}</div>}
            <form.Field
              name="emails"
              children={(field) => {
                const fieldValue = field.state.value;
                const isInvalid =
                  field.state.meta.isTouched &&
                  !field.state.meta.isValid &&
                  Array.isArray(fieldValue);
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>
                      Email Addresses
                    </FieldLabel>
                    <div className="relative">
                      <input
                        id={field.name}
                        name={field.name}
                        value={
                          Array.isArray(fieldValue)
                            ? fieldValue.join(", ")
                            : fieldValue
                        }
                        onBlur={field.handleBlur}
                        onChange={(e) => {
                          field.handleChange(e.target.value);
                        }}
                        placeholder="user1@example.com, user2@example.com"
                        className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                      />
                    </div>
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
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
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
              selector={(state) => [state.canSubmit, state.isSubmitting]}
              children={([canSubmit, isSubmitting]) => (
                <Button
                  type="submit"
                  disabled={!canSubmit || isSubmitting}
                  className="self-end"
                >
                  {isSubmitting ? "..." : "Invite"}
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
