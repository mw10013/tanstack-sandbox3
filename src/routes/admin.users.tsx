import * as React from "react";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { createServerFn, useServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import {
  AlertCircle,
  ChevronLeftIcon,
  ChevronRightIcon,
  Search,
} from "lucide-react";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const LIMIT = 5;

const banUserSchema = z.object({
  userId: z.string(),
  banReason: z.string().max(100),
});

export const getUsers = createServerFn({ method: "GET" })
  .inputValidator(
    z.object({
      page: z.coerce.number().int().min(1).default(1),
      filter: z.string().trim().optional(),
    }),
  )
  .handler(async ({ data, context: { repository } }) => {
    const { page, filter } = data;
    const offset = (page - 1) * LIMIT;
    const result = await repository.getUsers({
      limit: LIMIT,
      offset,
      searchValue: filter && filter !== "" ? filter : undefined,
    });
    const pageCount = Math.max(1, Math.ceil(result.count / LIMIT));
    return {
      users: result.users,
      page,
      pageCount,
      filter,
    };
  });

export const banUser = createServerFn({ method: "POST" })
  .inputValidator((data: z.input<typeof banUserSchema>) => data)
  .handler(async ({ data, context: { authService } }) => {
    const parseResult = banUserSchema.safeParse(data);
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
      await authService.api.banUser({
        headers: request.headers,
        body: {
          userId: parseResult.data.userId,
          banReason: parseResult.data.banReason,
        },
      });
    } catch (error: unknown) {
      return {
        success: false,
        errorMap: {
          onSubmit: {
            form: `Failed to ban user: ${
              error instanceof Error ? error.message : String(error)
            }`,
            fields: {},
          },
        },
      };
    }
    return { success: true };
  });

export const unbanUser = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string() }))
  .handler(async ({ data, context: { authService } }) => {
    const request = getRequest();
    await authService.api.unbanUser({
      headers: request.headers,
      body: { userId: data.userId },
    });
    return { success: true };
  });

export const impersonateUser = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string() }))
  .handler(async ({ data, context: { authService } }) => {
    const request = getRequest();
    const { headers } = await authService.api.impersonateUser({
      returnHeaders: true,
      headers: request.headers,
      body: { userId: data.userId },
    });
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw redirect({ to: "/app", headers });
  });

export const Route = createFileRoute("/admin/users")({
  validateSearch: (search) => {
    const schema = z.object({
      page: z.coerce.number().int().min(1).default(1),
      filter: z.string().trim().optional(),
    });
    return schema.parse(search);
  },
  loaderDeps: ({ search }) => ({ page: search.page, filter: search.filter }),
  loader: async ({ deps }) => {
    const result = await getUsers({ data: deps });
    if (deps.page > result.pageCount) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({
        to: "/admin/users",
        search: { page: result.pageCount, filter: deps.filter },
      });
    }
    return result;
  },
  component: RouteComponent,
});

function RouteComponent() {
  const router = useRouter();
  const data = Route.useLoaderData();
  const unbanUserFn = useServerFn(unbanUser);
  const impersonateUserFn = useServerFn(impersonateUser);
  const [banDialog, setBanDialog] = React.useState<{
    isOpen: boolean;
    userId?: string;
  }>({ isOpen: false });
  const search = Route.useSearch();

  const handleFilterSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const filter = formData.get("filter");
    if (typeof filter === "string") {
      void router.navigate({
        to: "/admin/users",
        search: { filter, page: 1 },
      });
    }
  };

  return (
    <div className="flex flex-col gap-8 p-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground text-sm">
          Manage your users and roles.
        </p>
      </header>

      <form onSubmit={handleFilterSubmit}>
        <InputGroup>
          <InputGroupInput
            name="filter"
            defaultValue={search.filter ?? ""}
            placeholder="Filter by email..."
            aria-label="Filter by email"
          />
          <InputGroupAddon>
            <Search className="size-4" />
          </InputGroupAddon>
        </InputGroup>
      </form>

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
                          void unbanUserFn({
                            data: { userId: String(user.userId) },
                          }).then(() => router.invalidate());
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
                        void impersonateUserFn({
                          data: { userId: String(user.userId) },
                        });
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

      {data.pageCount > 1 && (
        <Pagination>
          <PaginationContent>
            {data.page > 1 ? (
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => {
                    void router.navigate({
                      to: "/admin/users",
                      search: {
                        page: data.page - 1,
                        filter: search.filter,
                      },
                    });
                  }}
                />
              </PaginationItem>
            ) : (
              <PaginationItem>
                <span className="text-muted-foreground h-9 px-4 py-2 inline-flex items-center">
                  <ChevronLeftIcon className="size-4 mr-1" />
                  <span className="hidden sm:inline">Previous</span>
                </span>
              </PaginationItem>
            )}
            {Array.from({ length: data.pageCount }, (_, i) => {
              const page = i + 1;
              return (
                <PaginationItem key={page}>
                  <PaginationLink
                    onClick={() => {
                      void router.navigate({
                        to: "/admin/users",
                        search: { page, filter: search.filter },
                      });
                    }}
                    isActive={page === data.page}
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              );
            })}
            {data.page < data.pageCount ? (
              <PaginationItem>
                <PaginationNext
                  onClick={() => {
                    void router.navigate({
                      to: "/admin/users",
                      search: {
                        page: data.page + 1,
                        filter: search.filter,
                      },
                    });
                  }}
                />
              </PaginationItem>
            ) : (
              <PaginationItem>
                <span className="text-muted-foreground h-9 px-4 py-2 inline-flex items-center">
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRightIcon className="size-4 ml-1" />
                </span>
              </PaginationItem>
            )}
          </PaginationContent>
        </Pagination>
      )}

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
      />
    </div>
  );
}

function BanDialog({
  userId,
  isOpen,
  onOpenChange,
}: {
  userId?: string;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}) {
  const router = useRouter();
  const actionServerFn = useServerFn(banUser);
  const action = useMutation({
    mutationFn: async (data: z.input<typeof banUserSchema>) =>
      actionServerFn({ data }),
    onSuccess: (result) => {
      if (result.success) {
        onOpenChange(false);
        void router.invalidate();
      } else {
        form.setErrorMap(result.errorMap);
      }
    },
  });

  const form = useForm({
    defaultValues: {
      banReason: "",
    },
    onSubmit: ({ value }) => {
      if (userId) action.mutate({ userId, banReason: value.banReason });
    },
  });

  React.useEffect(() => {
    if (isOpen && userId) {
      form.reset({
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
          <form.Subscribe selector={(formState) => formState.canSubmit}>
            {(canSubmit) => (
              <Button
                type="submit"
                form="ban-form"
                disabled={!canSubmit || action.isPending}
              >
                {action.isPending ? "..." : "Ban"}
              </Button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
