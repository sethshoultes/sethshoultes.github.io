// The plugins' edge code, composed (functions/_plugins.js lists them, in name order). A plugin's handle(context, data,
// newRewriter) returns a Response, or null to leave the page alone. A plugin that answers hands its response on as the next
// plugin's next(), so content-blocks can swap a page's text and location-picker then rewrite its header; the response of the
// last plugin to answer is served. A plugin that answers without calling next() (a redirect) replaces what came before.
// The `next(req)` a later plugin calls ignores the `req` it passes once an earlier plugin has answered (the earlier response is
// handed on as it is), so a plugin that must change the request for the page (strip a conditional header, as content-blocks and
// location-picker each do) does it itself before the first next() it reaches, not by relying on this chain to honour `req`.
// One plugin throwing is logged and skipped: a broken feature never takes the pages down. Null when nobody answered.
// Required plugins (plugin.json `"edge": {"required": true}`, site-kit#376) are not run here; runRequired runs them first. A
// middleware whose runEdge lists a required plugin that runRequired never passed on this request gets a 503, never an
// ungated page. Which plugins passed is kept beside the request, never written onto its context (a frozen one stays usable).
// A required plugin may also decorate (plugin.json `"edge": {"required": true, "decorate": true}`, site-kit#602): runEdge calls
// its decorate(context, data, newRewriter) last, only when it passed this request, to change the page it let through.
const PASSED = new WeakMap();
const unavailable = () => new Response("Service unavailable\n", { status: 503, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });

export async function runEdge(context, plugins, newRewriter = () => new HTMLRewriter()) {
  const passed = PASSED.get(context);
  const unpassed = plugins.filter((p) => p.required && !passed?.has(p.name)).map((p) => p.name);
  if (unpassed.length) {
    console.log(JSON.stringify({ error: "runEdge ran before runRequired passed this request", required: unpassed }));
    return unavailable();
  }
  let current = null;
  for (const plugin of plugins) {
    // A behind plugin runs here only when it is public (site-kit#467), and then with its gate's member set to null: an
    // ungated path never has one, and nothing here can stand in for the gate's own check.
    if (plugin.required || (plugin.behind && !plugin.public)) continue;
    const ctx = plugin.behind ? { ...context, data: { ...context.data, [plugin.behind]: Object.freeze({ ...(context.data && context.data[plugin.behind]), member: null }) } } : context;
    try {
      const answer = await plugin.handle({ ...ctx, next: (req) => (current ? Promise.resolve(current) : context.next(req)) }, plugin.data, newRewriter);
      if (answer) current = answer;
    } catch (err) {
      console.log(JSON.stringify({ plugin: plugin.name, error: String(err && err.message ? err.message : err) }));
    }
  }
  // site-kit#602: a required plugin that passed this request may decorate the page it let through (members' profile menu),
  // last, with the response so far as its next(). Null leaves the page alone; a throw is logged and the page served as it was.
  for (const plugin of plugins) {
    if (!plugin.required || !plugin.decorate || !passed?.has(plugin.name)) continue;
    try {
      const answer = await plugin.decorate({ ...context, next: (req) => (current ? Promise.resolve(current) : context.next(req)) }, plugin.data, newRewriter);
      if (answer) current = answer;
    } catch (err) {
      console.log(JSON.stringify({ plugin: plugin.name, decorate: true, error: String(err && err.message ? err.message : err) }));
    }
  }
  return current;
}

// The required plugins (a members gate), which a site's functions/_middleware.js runs before anything else: before
// agentFiles, runEdge and any asset it serves itself. The first to answer is served as it is and nothing else runs, so a gate
// that lets a member through answers with the page itself (its own next()). A throw is a 503 that is never cached, never the
// page: a broken gate must not hand out what it guards. Null when none answered: the request may go on (a visitor to an
// unguarded page, or a member the gate let through), and the rest of the middleware runs. The middleware returns any answer it
// gets as it is.
//
// A plugin "behind" a gate (plugin.json `"edge": {"behind": "members"}`, site-kit#432) runs only from inside that gate's pass:
// the gate is handed a next() that asks the plugins behind it first, then the page. So it never runs for a request the gate
// refused or never saw, and runEdge never runs it. The first behind plugin to answer is served (through the gate, which adds
// its no-store and noindex); a behind plugin that throws is a 503, never the page underneath. A behind plugin whose gate isn't
// in the list never runs at all (and the build refuses that site). A behind plugin that is also "public" (site-kit#467) runs
// here for its gated paths as before, and in runEdge for ungated ones, with no member.
export async function runRequired(context, plugins, newRewriter = () => new HTMLRewriter()) {
  const passed = new Set();
  for (const plugin of plugins) {
    if (!plugin.required) continue;
    const behind = plugins.filter((p) => !p.required && p.behind === plugin.name);
    const gated = behind.length ? { ...context, next: (req) => runBehind(context, behind, req, newRewriter) } : context;
    try {
      const answer = await plugin.handle(gated, plugin.data, newRewriter);
      if (answer) return answer;
      passed.add(plugin.name);
    } catch (err) {
      console.log(JSON.stringify({ plugin: plugin.name, required: true, error: String(err && err.message ? err.message : err) }));
      return unavailable();
    }
  }
  if (passed.size) PASSED.set(context, passed);
  return null;
}

async function runBehind(context, behind, req, newRewriter) {
  for (const plugin of behind) {
    try {
      const answer = await plugin.handle({ ...context, next: (r) => context.next(r ?? req) }, plugin.data, newRewriter);
      if (answer) return answer;
    } catch (err) {
      console.log(JSON.stringify({ plugin: plugin.name, behind: plugin.behind, error: String(err && err.message ? err.message : err) }));
      return unavailable();
    }
  }
  return context.next(req);
}
