// Where the guestbook keeps its data: one Netlify Blobs store, read and written through
// Twikoo's own Blob KV database (the one its EdgeOne Makers adapter uses). Messages, settings
// and visit counts all live in this store, so no MongoDB is needed.
//
// Open a new database for every request. BlobKvDatabase keeps the message list in memory for
// as long as the object lives, so an object shared between requests would keep serving an old
// list after another function instance has written a new one.
import { getStore } from "@netlify/blobs";
import { BlobKvDatabase } from "@twikoojs/common";

export const STORE_NAME = "twikoo";

export function openDatabase() {
  return new BlobKvDatabase(getStore({ name: STORE_NAME, consistency: "strong" }));
}
