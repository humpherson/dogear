import { preloadablePage } from './preloadablePage';

const library = preloadablePage(() =>
  import('../pages/LibraryPage').then((module) => ({
    default: module.LibraryPage,
  })),
);
const book = preloadablePage(() =>
  import('../pages/BookPage').then((module) => ({ default: module.BookPage })),
);

const collection = preloadablePage(() =>
  import('../pages/CollectionPage').then((module) => ({
    default: module.CollectionPage,
  })),
);

export const loadLibraryPage = library.load;
export const loadBookPage = book.load;
export const loadCollectionPage = collection.load;
export const LibraryPage = library.Page;
export const BookPage = book.Page;
export const CollectionPage = collection.Page;
