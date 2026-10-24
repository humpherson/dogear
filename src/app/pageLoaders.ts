// Reuse the same module loader for React.lazy and intent-based preloading.
export const loadLibraryPage = () =>
  import('../pages/LibraryPage').then((module) => ({
    default: module.LibraryPage,
  }));
export const loadBookPage = () =>
  import('../pages/BookPage').then((module) => ({ default: module.BookPage }));

export const loadCollectionPage = () =>
  import('../pages/CollectionPage').then((module) => ({
    default: module.CollectionPage,
  }));
