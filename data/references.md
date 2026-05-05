# Reference Catalog

Canonical URLs for resources this blog references. The daily-blog pipeline and
the inline-link retrofit script consult this file to add hyperlinks on natural
mentions, so a reader can follow any concept to its source.

**The default behavior is TO LINK.** If the post mentions a phrase that matches
an entry below, link the first natural occurrence. Abstain only when the
phrase is too generic to read naturally as a link. Missing links is a worse
failure than over-linking.

## Format

Each entry is a `## <name>` heading with these fields:
- `url:` — the canonical URL (absolute or site-relative)
- `triggers:` — phrases in prose that should link here on first natural mention
- `description:` — what the linked resource is

Add new entries as resources come online. Triggers should be specific enough
to read naturally as link text.

---

# Recipes (on this site)

## Brain vault recipe
url: /recipes/claude-code-brain-vault.html
triggers: brain vault, brain-vault recipe, the vault setup, claude code brain vault
description: The full setup recipe for the brain vault — Obsidian + Git + the /brain skill + lifecycle hooks.

## Canonical secrets recipe
url: /recipes/set-up-canonical-secrets.html
triggers: canonical secrets, the canonical secrets recipe, set up canonical secrets, ~/.config/dev-secrets, dev-secrets
description: The recipe for setting up the canonical secrets file at ~/.config/dev-secrets/secrets.env.

## ElevenLabs RAG recipe
url: /recipes/add-rag-to-elevenlabs-agent.html
triggers: ElevenLabs RAG, add RAG to ElevenLabs, the RAG recipe, knowledge base of URLs
description: The recipe for adding a knowledge base of URLs to an ElevenLabs Conversational AI agent.

## HeyGen avatar recipe
url: /recipes/add-avatar-to-site.html
triggers: HeyGen avatar, add an avatar to a site, the avatar recipe
description: The recipe for adding a HeyGen avatar widget to a static site.

## ElevenLabs client-tool recipe
url: /recipes/register-elevenlabs-client-tool.html
triggers: ElevenLabs client tool, register a client tool, the client-tool recipe
description: The recipe for registering a client-side tool with an ElevenLabs Conversational AI agent.

# Public GitHub repos under sethshoultes/

## building-with-ai-brain (public skeleton brain)
url: https://github.com/sethshoultes/building-with-ai-brain
triggers: building-with-ai-brain, public skeleton, the public-readable mirror, the brain repo, public brain
description: The public-readable mirror of the brain vault — example structure (learnings/, runbooks/, vault/) for anyone building their own.

## building-with-ai-skills (public skills cookbook)
url: https://github.com/sethshoultes/building-with-ai-skills
triggers: building-with-ai-skills, public skills repo, the skills cookbook, the cookbook recipe, the public skills cookbook
description: The public cookbook of SKILL.md examples that can be installed by anyone.

## great-authors-plugin
url: https://github.com/sethshoultes/great-authors-plugin
triggers: great-authors-plugin, the great-authors plugin
description: Plugin in the Great Minds Constellation — author personas (Hemingway, McPhee, King, etc).

## great-engineers-plugin
url: https://github.com/sethshoultes/great-engineers-plugin
triggers: great-engineers-plugin, the great-engineers plugin
description: Plugin in the Great Minds Constellation — engineer personas (Carmack, Knuth, Torvalds, etc).

## great-designers-plugin
url: https://github.com/sethshoultes/great-designers-plugin
triggers: great-designers-plugin, the great-designers plugin
description: Plugin in the Great Minds Constellation — design personas (Rams, Norman, Kare, etc).

## great-counsels-plugin
url: https://github.com/sethshoultes/great-counsels-plugin
triggers: great-counsels-plugin, the great-counsels plugin
description: Plugin in the Great Minds Constellation — legal/counsel personas.

## great-marketers-plugin
url: https://github.com/sethshoultes/great-marketers-plugin
triggers: great-marketers-plugin, the great-marketers plugin
description: Plugin in the Great Minds Constellation — marketing personas (Ogilvy, Bernbach, etc).

## great-operators-plugin
url: https://github.com/sethshoultes/great-operators-plugin
triggers: great-operators-plugin, the great-operators plugin
description: Plugin in the Great Minds Constellation — operations personas (Cook, Grove, Munger, etc).

## great-publishers-plugin
url: https://github.com/sethshoultes/great-publishers-plugin
triggers: great-publishers-plugin, the great-publishers plugin
description: Plugin in the Great Minds Constellation — publishing personas.

## great-researchers-plugin
url: https://github.com/sethshoultes/great-researchers-plugin
triggers: great-researchers-plugin, the great-researchers plugin
description: Plugin in the Great Minds Constellation — research personas.

## great-filmmakers-plugin
url: https://github.com/sethshoultes/great-filmmakers-plugin
triggers: great-filmmakers-plugin, the great-filmmakers plugin
description: Plugin in the Great Minds Constellation — filmmaker personas.

## great-educators-plugin
url: https://github.com/sethshoultes/great-educators-plugin
triggers: great-educators-plugin, the great-educators plugin
description: Plugin in the Great Minds Constellation — educator personas (Montessori, Freire, Feynman, etc).

## great-minds-plugin
url: https://github.com/sethshoultes/great-minds-plugin
triggers: great-minds-plugin, the great-minds plugin, the constellation orchestrator
description: The orchestrator plugin that coordinates the Great Minds Constellation personas.

## great-minds-constellation
url: https://github.com/sethshoultes/great-minds-constellation
triggers: great-minds-constellation, the Great Minds Constellation, the constellation
description: The umbrella project — meta-plugin combining all the great-* persona plugins.

## great-minds-cookbook
url: https://github.com/sethshoultes/great-minds-cookbook
triggers: great-minds-cookbook, the great-minds cookbook
description: The cookbook of multi-persona recipes — multi-agent essay production, etc.

## dash-command-bar
url: https://github.com/sethshoultes/dash-command-bar
triggers: dash-command-bar
description: A command-bar interface project.

# Brain learnings (within building-with-ai-brain)

## Learning: agents-hallucinate-apis
url: https://github.com/sethshoultes/building-with-ai-brain/blob/main/learnings/agents-hallucinate-apis.md
triggers: agents-hallucinate-apis, hallucinated APIs, hallucinated API
description: Brain learning on agents inventing API surfaces that don't exist.

## Learning: hooks-are-commitment-devices
url: https://github.com/sethshoultes/building-with-ai-brain/blob/main/learnings/hooks-are-commitment-devices.md
triggers: hooks-are-commitment-devices learning
description: Brain learning that became the post Hooks Are Commitment Devices.

## Learning: hooks-as-temporal-grammar-of-tool-systems
url: https://github.com/sethshoultes/building-with-ai-brain/blob/main/learnings/hooks-as-temporal-grammar-of-tool-systems.md
triggers: hooks-as-temporal-grammar, temporal grammar of tool systems
description: Brain learning that became the Nouns and Verbs post.

## Learning: constellation-pipeline-transmits-concern
url: https://github.com/sethshoultes/building-with-ai-brain/blob/main/learnings/constellation-pipeline-transmits-concern.md
triggers: constellation-pipeline-transmits-concern, the pipeline transmits the operator's concern learning
description: Brain learning on the pipeline transmitting the operator's concern.

## Learning: multi-agent-essay-production-recipe
url: https://github.com/sethshoultes/building-with-ai-brain/blob/main/learnings/multi-agent-essay-production-recipe.md
triggers: multi-agent-essay-production-recipe, the multi-agent essay production recipe
description: Brain learning that documents the multi-agent recipe used to produce blog posts.

## Learning: orchestrator-and-writer-are-different-ai-roles
url: https://github.com/sethshoultes/building-with-ai-brain/blob/main/learnings/orchestrator-and-writer-are-different-ai-roles.md
triggers: orchestrator-and-writer-are-different-ai-roles, orchestrator versus writer
description: Brain learning on the role separation between orchestrator and writer.

## Learning: cross-model-persona-portability
url: https://github.com/sethshoultes/building-with-ai-brain/blob/main/learnings/cross-model-persona-portability.md
triggers: cross-model-persona-portability, persona portability across models
description: Brain learning on portable persona files across different AI models.

## Learning: github-pages-rebuild-race
url: https://github.com/sethshoultes/building-with-ai-brain/blob/main/learnings/github-pages-rebuild-race-breaks-post-publish-webhooks.md
triggers: GitHub Pages rebuild race, pages rebuild race
description: Brain learning on Pages rebuild timing breaking webhooks.

## Learning: liteavatar-sdk-no-client-user-message
url: https://github.com/sethshoultes/building-with-ai-brain/blob/main/learnings/liteavatar-sdk-no-client-user-message.md
triggers: liteavatar SDK, LITE-mode SDK, session.message limitation
description: Brain learning on LITE-mode SDK limitations.

## Learning: elevenlabs-tool-call-event-shape
url: https://github.com/sethshoultes/building-with-ai-brain/blob/main/learnings/elevenlabs-tool-call-event-shape.md
triggers: elevenlabs-tool-call-event-shape, ElevenLabs tool call event shape
description: Brain learning on the nesting of ElevenLabs tool-call event payloads.

## Learning: mcp-discovery-loop-three-file-pattern
url: https://github.com/sethshoultes/building-with-ai-brain/blob/main/learnings/mcp-discovery-loop-three-file-pattern.md
triggers: MCP discovery loop, three-file pattern, mcp-discovery-loop
description: Brain learning on the three-file pattern for MCP agent discovery.

## Learning: cloudflare-worker-custom-domain
url: https://github.com/sethshoultes/building-with-ai-brain/blob/main/learnings/cloudflare-worker-custom-domain-needs-zone-account-match.md
triggers: cloudflare-worker-custom-domain, Cloudflare Worker custom domain
description: Brain learning on Cloudflare Worker custom-domain zone-account match constraint.

# Brain runbooks

## Runbook: Add a public MCP endpoint to a static site
url: https://github.com/sethshoultes/building-with-ai-brain/blob/main/runbooks/Add%20a%20public%20MCP%20endpoint%20to%20a%20static%20site.md
triggers: add a public MCP endpoint, MCP endpoint to a static site
description: Runbook for adding a public MCP endpoint to a static site.

## Runbook: Attach a Cloudflare Worker to a custom subdomain
url: https://github.com/sethshoultes/building-with-ai-brain/blob/main/runbooks/Attach%20a%20Cloudflare%20Worker%20to%20a%20custom%20subdomain.md
triggers: attach a Cloudflare Worker, Cloudflare Worker to a custom subdomain
description: Runbook for attaching a Cloudflare Worker to a custom subdomain.

## Runbook: Register ElevenLabs Client Tool via API
url: https://github.com/sethshoultes/building-with-ai-brain/blob/main/runbooks/Register%20ElevenLabs%20Client%20Tool%20via%20API.md
triggers: register ElevenLabs client tool, ElevenLabs client tool via API
description: Runbook for registering an ElevenLabs client tool programmatically.

# External sites

## Garage Door Science
url: https://garagedoorscience.com
triggers: garagedoorscience.com, garage door science
description: Seth's primary product/site — the working build that the blog often references.

## Garage Door Science: brain
url: https://garagedoorscience.com/brain
triggers: garagedoorscience.com/brain, the GDS brain
description: The brain page on garagedoorscience.com.

## Garage Door Science: developers
url: https://garagedoorscience.com/developers
triggers: garagedoorscience.com/developers, the GDS developer site, garagedoorscience developers
description: The developer area of garagedoorscience.com.

## Garage Door Science: MCP
url: https://garagedoorscience.com/mcp
triggers: garagedoorscience.com/mcp, the GDS MCP endpoint
description: The MCP endpoint for garagedoorscience.com.

## Garage Door Science: openapi
url: https://garagedoorscience.com/openapi.json
triggers: garagedoorscience.com/openapi.json, the GDS OpenAPI spec
description: The OpenAPI spec for garagedoorscience.com.

## Garage Door Science: llms.txt
url: https://garagedoorscience.com/llms.txt
triggers: garagedoorscience.com/llms.txt, the GDS llms.txt
description: The llms.txt for garagedoorscience.com.

## Garage Door Science: ask-maya
url: https://garagedoorscience.com/ask-maya
triggers: garagedoorscience.com/ask-maya, ask Maya, the Maya avatar
description: The Maya avatar conversational interface on garagedoorscience.com.

## Agents Assemble Workshop
url: https://github.com/caseproof/agents-assemble-workshop-exercise
triggers: agents-assemble-workshop-exercise, the agents-assemble workshop
description: The Agents Assemble workshop exercise repo.

## Agents Assemble Workshop (live)
url: https://caseproof.github.io/agents-assemble-workshop-exercise/
triggers: agents-assemble-workshop, the workshop site
description: The live workshop site for Agents Assemble.

## LiveAvatar Agent Skills
url: https://github.com/heygen-com/liveavatar-agent-skills
triggers: liveavatar-agent-skills, LiveAvatar agent skills
description: HeyGen's LiveAvatar agent skills repo.
