import * as React from "react";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const LIMIT = 10;

const actionSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("ban"),
    userId: z.string(),
    banReason: z.string().max(500),
  }),
  z.object({ intent: z.literal("unban"), userId: z.string() }),
  z.object({ intent: z.literal("impersonate"), userId: z.string() }),
]);

export const getUsers = createServerFn({ method: "GET" }).handler(
  async ({ context: { repository } }) => {
    const result = await repository.getUsers({
      limit: LIMIT,
      offset: 0,
    });
    const pageCount = Math.max(1, Math.ceil(result.count / LIMIT));
    return {
      users: result.users,
      page: 1,
      pageCount,
      filter: "",
    };
  },
);

export const userAction = createServerFn({ method: "POST" })
  .inputValidator((data: z.input<typeof actionSchema>) => data)
  .handler(async ({ data, context: { env, authService } }) => {
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
    switch (parseResult.data.intent) {
      case "ban": {
        await env.D1.prepare(
          "update User set banned = 1, banReason = ?1, banExpires = datetime('now', '+1 year') where userId = ?2",
        )
          .bind(parseResult.data.banReason, parseResult.data.userId)
          .run();
        return { success: true };
      }
      case "unban": {
        await env.D1.prepare(
          "update User set banned = 0, banReason = null, banExpires = null where userId = ?1",
        )
          .bind(parseResult.data.userId)
          .run();
        return { success: true };
      }
      case "impersonate": {
        const session = await authService.api.impersonateUser({
          body: { userId: parseResult.data.userId },
          returnHeaders: true,
        });
        const headers = new Headers();
        session.headers.forEach((value, key) => {
          if (key.toLowerCase() === "set-cookie") {
            headers.append(key, value);
          }
        });
        throw Object.assign(new Error("impersonate"), {
          _redirect: { to: "/app", headers },
        });
      }
      default:
        void parseResult.data;
        throw new Error("Unexpected intent");
    }
  });

export const Route = createFileRoute("/admin/users")({
  loader: () => getUsers(),
  component: RouteComponent,
});

function RouteComponent() {
  const router = useRouter();
  const data = Route.useLoaderData();
  const actionFn = useServerFn(userAction);
  const [banDialog, setBanDialog] = React.useState<{
    isOpen: boolean;
    userId?: string;
  }>({ isOpen: false });

  const handleAction = async (
    intent: string,
    userId: string,
    banReason?: string,
  ) => {
    const result = await actionFn({
      data:
        intent === "ban"
          ? { intent: "ban" as const, userId, banReason: banReason ?? "" }
          : intent === "unban"
            ? { intent: "unban" as const, userId }
            : { intent: "impersonate" as const, userId },
    });
    if ("_redirect" in result) {
      throw result._redirect;
    }
    void router.invalidate();
  };

  return (
    <div className="flex flex-col gap-8 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground text-sm">
          Manage your users and roles.
        </p>
      </header>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8">Id</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Verified</TableHead>
            <TableHead>Banned</TableHead>
            <TableHead>Ban Reason</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-10 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.users.map((user) => (
            <TableRow key={user.userId}>
              <TableCell>{user.userId}</TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>{user.role}</TableCell>
              <TableCell>{String(user.emailVerified)}</TableCell>
              <TableCell>{String(user.banned)}</TableCell>
              <TableCell>{user.banReason ?? ""}</TableCell>
              <TableCell>{user.createdAt.toLocaleString()}</TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={(props) => (
                      <Button
                        {...props}
                        variant="ghost"
                        className="size-8 p-0"
                        aria-label={`Open menu for ${user.email}`}
                      >
                        ⋮
                      </Button>
                    )}
                  />
                  <DropdownMenuContent align="end">
                    {user.banned ? (
                      <DropdownMenuItem
                        onClick={() => {
                          void handleAction("unban", String(user.userId));
                        }}
                      >
                        Unban
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => {
                          setBanDialog({
                            isOpen: true,
                            userId: String(user.userId),
                          });
                        }}
                      >
                        Ban
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      onClick={() => {
                        void handleAction("impersonate", String(user.userId));
                      }}
                    >
                      Impersonate
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <BanDialog
        key={banDialog.userId}
        userId={banDialog.userId}
        isOpen={banDialog.isOpen}
        onOpenChange={(isOpen) => {
          setBanDialog((prev) =>
            prev.isOpen === isOpen
              ? prev
              : isOpen
                ? { ...prev, isOpen }
                : { isOpen: false, userId: undefined },
          );
        }}
        onSubmit={({ userId, banReason }) => {
          void handleAction("ban", userId, banReason);
        }}
      />
    </div>
  );
}

function BanDialog({
  userId,
  isOpen,
  onOpenChange,
  onSubmit,
}: {
  userId?: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: ({
    userId,
    banReason,
  }: {
    userId: string;
    banReason: string;
  }) => void;
}) {
  const form = useForm({
    defaultValues: {
      intent: "ban" as const,
      userId: userId ?? "",
      banReason: "",
    },
    onSubmit: ({ value }) => {
      onSubmit({ userId: value.userId, banReason: value.banReason });
      onOpenChange(false);
    },
  });

  React.useEffect(() => {
    if (isOpen && userId) {
      form.reset({
        intent: "ban",
        userId,
        banReason: "",
      });
    }
  }, [isOpen, userId, form]);

  if (!userId) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ban User</DialogTitle>
          <DialogDescription>
            Provide a reason for banning this user.
          </DialogDescription>
        </DialogHeader>
        <form
          id="ban-form"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <FieldGroup>
            <form.Field
              name="intent"
              children={(field) => (
                <input
                  name={field.name}
                  type="hidden"
                  value={field.state.value}
                />
              )}
            />
            <form.Field
              name="userId"
              children={(field) => (
                <input
                  name={field.name}
                  type="hidden"
                  value={field.state.value}
                />
              )}
            />
            <form.Field
              name="banReason"
              children={(field) => {
                const isInvalid =
                  field.state.meta.isTouched && !field.state.meta.isValid;
                return (
                  <Field data-invalid={isInvalid}>
                    <FieldLabel htmlFor={field.name}>Reason</FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(e) => {
                        field.handleChange(e.target.value);
                      }}
                      autoFocus
                      aria-invalid={isInvalid}
                    />
                    {isInvalid && (
                      <FieldError errors={field.state.meta.errors} />
                    )}
                  </Field>
                );
              }}
            />
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <form.Subscribe
            selector={(formState) => [
              formState.canSubmit,
              formState.isSubmitting,
            ]}
          >
            {([canSubmit, isSubmitting]) => (
              <Button
                type="submit"
                form="ban-form"
                disabled={!canSubmit || isSubmitting}
              >
                {isSubmitting ? "..." : "Ban"}
              </Button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
