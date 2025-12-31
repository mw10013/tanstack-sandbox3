'use client'
import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { createServerFn, useServerFn } from '@tanstack/react-start'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const schema = z.object({
  age: z.number().min(3, 'Must be at least 3 years old'),
})

export const action = createServerFn({
  method: 'POST',
})
  // Declare input types for the client/server fn call, but keep validation in the handler
  // so we can return a TanStack Form-compatible errorMap instead of throwing.
  .inputValidator((data: z.input<typeof schema>) => data)
  .handler(({ data }) => {
    const parseResult = schema.safeParse(data)
    console.log(
      `action.handler: parseResult: ${JSON.stringify({ parseResult, data })}`,
    )
    if (!parseResult.success) {
      const { formErrors, fieldErrors } = z.flattenError(parseResult.error)
      const errorMap = {
        onSubmit: {
          ...(formErrors.length > 0 ? { form: formErrors.join(', ') } : {}),
          fields: Object.entries(fieldErrors).reduce<
            Record<string, { message: string }[]>
          >((acc, [key, messages]) => {
            acc[key] = messages.map((message) => ({ message }))
            return acc
          }, {}),
        },
      }
      console.log(`action: errorMap: ${JSON.stringify({ errorMap })}`)
      return { success: false, errorMap }
    }
    return { success: true, data: parseResult.data }
  })

export const Route = createFileRoute('/_layout/form3')({
  component: RouteComponent,
})

function RouteComponent() {
  const callAction = useServerFn(action)
  const form = useForm({
    defaultValues: {
      age: 0,
    },
    onSubmit: async ({ value }) => {
      console.log(`onSubmit: value: ${JSON.stringify(value)}`)
      const result = await callAction({ data: value })
      console.log(`action result: ${JSON.stringify(result)}`)
      if (!result.success) {
        form.setErrorMap(result.errorMap)
      }
    },
  })

  return (
    <div className="p-6">
      <form
        id="age-check-form"
        method="post"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <Card className="w-full sm:max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Age Check</CardTitle>
            <CardDescription className="grid gap-2">
              We need to check your age before you can proceed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <form.Field
                name="age"
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid
                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor={field.name}>Age</FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="number"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) =>
                          { field.handleChange(e.target.valueAsNumber); }
                        }
                        aria-invalid={isInvalid}
                      />
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
                      )}
                    </Field>
                  )
                }}
              />
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <form.Subscribe
              selector={(formState) => [
                formState.canSubmit,
                formState.isSubmitting,
              ]}
            >
              {([canSubmit, isSubmitting]) => (
                <>
                  <Field orientation="horizontal">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSubmitting}
                      onClick={() => { form.reset(); }}
                    >
                      Reset
                    </Button>
                    <Button type="submit" disabled={!canSubmit}>
                      {isSubmitting ? '...' : 'Submit'}
                    </Button>
                  </Field>
                </>
              )}
            </form.Subscribe>
          </CardFooter>
        </Card>
      </form>
    </div>
  )
}
