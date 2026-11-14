# webmcp

Registers a site's real tools with the browser's WebMCP API, so an agent in the browser can call them (site-kit#330,
herdos#3873). It covers the webMcp check on isitagentready. It follows the
[WebMCP explainer](https://github.com/webmachinelearning/webmcp):

```js
document.modelContext.registerTool({ name, description, inputSchema, execute })
```

- **Feature check.** The page script checks for `document.modelContext.registerTool` and does nothing without it. There's
  no polyfill. The explainer names only `document.modelContext`, so the script doesn't look for `navigator.modelContext`.
- **What `execute` does.** It posts the agent's input as JSON to the tool's endpoint, the same endpoint the tool's form
  already uses. It returns the answer as MCP text content (`{content: [{type: "text", text}]}`). When the endpoint answers
  with an error status, it adds `isError: true`, so the agent reads the endpoint's own message and can try again. The
  agent's cancel (`options.signal`) reaches the request.
- **Nothing new server-side.** It adds no new endpoint and no key. Tools that need sign-in are out of scope.

## The config

The tools come from a `webmcp` block in the site's agent config. That's the same file site-templates' `discovery.py`
reads (on a Jekyll site, `_data/agents.json`), so a site keeps one agent config. The plugin reads only `origin` and
`webmcp`:

```json
{"origin": "https://example.com",
 "webmcp": {"pages": ["/", "/tools/llms-txt/"],
            "tools": [{"name": "llms_txt", "description": "Write a site's llms.txt from its sitemap",
                       "endpoint": "/api/llms-txt",
                       "inputSchema": {"type": "object",
                                       "properties": {"url": {"type": "string", "description": "The site's address"}},
                                       "required": ["url"]}}]}}
```

- `pages`: the pages that get the script. Each is a path ending in `/`, served as `<dir>/<path>/index.html`. List the home
  page, so a scanner sees the script on load, and each tool's own page.
- `tools`: each tool needs four things.
  - `name`: 1 to 128 letters, digits, `_`, `.` or `-`, and each name only once.
  - `description`: what the tool does, for the agent.
  - `inputSchema`: a JSON Schema object with `"type": "object"`. Put a `description` on each property.
  - `endpoint`: a path on `origin`, or an `https://` address. The tool posts its input there as JSON.

With no block, or a block with no tools, the step writes nothing.

## Turning it on in a site

1. From the site's repo root, run `<kit>/scripts/plugin-sync.sh webmcp <tag>`.
2. **Keep the folder out of the served site.** The build writes the script the site serves, so the vendored folder
   shouldn't be served as-is. A Jekyll site adds `plugins/webmcp` to `exclude` in `_config.yml`.
3. **Run the step after the site's build**, before deploy:
   ```bash
   node plugins/webmcp/scripts/webmcp.mjs _site --config _data/agents.json
   ```
   It writes `_site/assets/plugins/webmcp/webmcp.js` with the tools inlined. On each listed page it adds
   `<script type="module" src="/assets/plugins/webmcp/webmcp.js"></script>` just before `</body>`. It refuses, and
   writes nothing, when any of these is true:
   - a tool has no name, description, endpoint or inputSchema;
   - an inputSchema isn't an object with `"type": "object"`;
   - an endpoint is neither a path on `origin` nor an https address;
   - the block has a key the plugin doesn't know, or a page path is malformed;
   - a listed page wasn't built, has no `</body>`, or already has the script;
   - an endpoint doesn't answer a GET, or answers 404, 410 or a server error, as `discovery.py` checks them. A POST
     endpoint that answers GET with 405 is there.

   `--offline` skips the endpoint check.
4. List `webmcp` in `.sitekit/features.json` with the issue number.

## The forms: declarative attributes

WebMCP's declarative explainer lets a `<form>` describe itself as a tool. The kit doesn't render a site's forms, so the
plugin doesn't add these attributes. A site can add them to its own form HTML, using the same name and words as its
`webmcp` entry:

```html
<form toolname="llms_txt" tooldescription="Write a site's llms.txt from its sitemap">
  <input name="url" toolparamdescription="The site's address" required>
</form>
```

Leave `toolautosubmit` off: the visitor still presses the button.

## What a site sets

Nothing in `plugin.json`. There's no binding, variable or secret, and the config is the `webmcp` block above.

## Tests

`node --test plugins/webmcp/tests/*.test.js` covers these cases:

- a missing or empty block writes nothing;
- each refusal;
- the endpoint check, and `--offline`;
- the tag goes on the listed pages, and only those;
- the built script, run headless in Node with a stub `document.modelContext`:
  - it registers exactly the configured tools;
  - `execute` posts to the endpoint and passes the signal;
  - an endpoint error comes back as `isError`;
  - with no WebMCP API, it registers nothing and makes no request.
