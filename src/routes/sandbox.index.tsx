import { createFileRoute } from "@tanstack/react-router";
import * as TanRouter from "@tanstack/react-router";

export const Route = createFileRoute("/sandbox/")({ component: App });

function App() {
  return (
    <div className="p-6">
      <TanRouter.Link to="/sandbox/example">Example</TanRouter.Link>
    </div>
  );
}
