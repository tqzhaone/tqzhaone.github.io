// The guestbook API: https://<project>.netlify.app/.netlify/functions/twikoo
//
// Same as the official template (github.com/twikoojs/twikoo-netlify), which exports
// twikoo-netlify's default handler, except that the handler gets the Netlify Blobs database
// from ../../lib/storage.mjs instead of connecting to MongoDB through MONGODB_URI.
import { createModernNetlifyFunc } from "twikoo-netlify";
import { openDatabase } from "../../lib/storage.mjs";

export default (request, context) => {
  const handle = createModernNetlifyFunc({ database: openDatabase() });
  return handle(request, context);
};
