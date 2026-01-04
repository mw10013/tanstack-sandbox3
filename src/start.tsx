import { createStart } from "@tanstack/react-start";
import { authSessionMiddleware } from "@/middleware/auth-session";

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [authSessionMiddleware],
  };
});
