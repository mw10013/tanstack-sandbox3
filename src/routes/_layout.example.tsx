import { createFileRoute } from '@tanstack/react-router'
import { ComponentExample } from '@/components/component-example'

export const Route = createFileRoute('/_layout/example')({
  component: RouteComponent,
})

function RouteComponent() {
  return <ComponentExample />
}
