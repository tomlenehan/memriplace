import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_layout/conversations')({
  component: () => <div>Hello /_layout/conversations!</div>
})