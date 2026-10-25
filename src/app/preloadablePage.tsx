import { createElement, lazy, type ComponentType } from 'react';

type PageModule = { default: ComponentType };

// Share the resolved component as well as the import promise. A fulfilled
// native import still resolves asynchronously when first passed to React.lazy;
// rendering the known component avoids an unnecessary Suspense fallback.
export function preloadablePage(importPage: () => Promise<PageModule>) {
  let loaded: PageModule | undefined;
  let pending: Promise<PageModule> | undefined;
  const load = () => {
    if (!pending)
      pending = importPage().then(
        (page) => {
          loaded = page;
          return page;
        },
        (error) => {
          pending = undefined;
          throw error;
        },
      );
    return pending;
  };
  const LazyPage = lazy(load);
  function Page() {
    return loaded ? createElement(loaded.default) : <LazyPage />;
  }
  return { load, Page };
}
