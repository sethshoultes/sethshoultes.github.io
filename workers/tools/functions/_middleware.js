import { guard } from './_lib/guard.js';

export async function onRequest(context) {
  const result = await guard(context.request, context.env);
  if (result.response) return result.response;
  context.data.body = result.body;
  return context.next();
}
