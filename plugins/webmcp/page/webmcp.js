// webmcp (site-kit#330): registers the site's tools with the browser's WebMCP API, so an agent in the browser can call them.
// scripts/webmcp.mjs puts the site's tools in TOOLS and writes this file to <built-dir>/assets/plugins/webmcp/webmcp.js; as
// it stands here it registers nothing. A browser without document.modelContext.registerTool gets nothing: no polyfill.
//
// Each tool's execute posts its input as JSON to the endpoint the tool's form already uses and returns the answer as MCP text
// content, with isError when the endpoint answers an error status, so the agent reads the endpoint's own message.
const TOOLS = [];

const context = globalThis.document?.modelContext;
if (typeof context?.registerTool === "function") {
  for (const tool of TOOLS) {
    const registered = context.registerTool({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      async execute(input, options) {
        const res = await fetch(tool.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input ?? {}),
          signal: options?.signal,
        });
        const answer = { content: [{ type: "text", text: await res.text() }] };
        if (!res.ok) answer.isError = true;
        return answer;
      },
    });
    // registerTool rejects with NotAllowedError where the page's permissions policy turns tools off.
    Promise.resolve(registered).catch((err) => console.warn(`webmcp: ${tool.name} was not registered: ${err?.message ?? err}`));
  }
}
