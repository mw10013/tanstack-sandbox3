import * as React from "react";

/**
 * https://github.com/microsoft/playwright/issues/27759
 */
export function useIsMounted() {
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  return isMounted;
}
