# Reference Catalog

Canonical URLs for resources this blog references frequently. The daily-blog
pipeline and the inline-link retrofit script consult this file to add hyperlinks
on natural first mentions, so a reader who wants to follow a concept to its
source can do so without leaving the post.

## Format

Each entry is a `## <name>` heading with these fields:
- `url:` — the canonical URL (absolute or site-relative)
- `triggers:` — phrases in prose that should link here on first natural mention
- `description:` — what the linked resource is, for the model's context

Add new entries as resources come online. Keep `triggers` short and specific —
overly broad triggers cause over-linking.

---

## Brain vault recipe
url: /recipes/claude-code-brain-vault.html
triggers: brain vault, brain-vault recipe, the vault setup, claude code brain vault
description: The full setup recipe for the brain vault — Obsidian + Git + the /brain skill + lifecycle hooks. The canonical destination when a post mentions "the brain vault" as a system that can be built, rather than as a concept in passing.

## Public skeleton (brain repo)
url: https://github.com/sethshoultes/building-with-ai-brain
triggers: public skeleton, building-with-ai-brain, public-readable mirror of the brain, the brain repo
description: The public-readable mirror of the brain vault — example structure (learnings/, runbooks/, projects/, vault/) for anyone building their own.

## Public skills cookbook
url: https://github.com/sethshoultes/building-with-ai-skills
triggers: building-with-ai-skills, public skills repo, the skills cookbook, the cookbook recipe
description: The public cookbook of SKILL.md examples that can be installed by anyone — paired with the brain repo as the public-readable arms of the operator's setup.

## Canonical secrets recipe
url: /recipes/set-up-canonical-secrets.html
triggers: canonical secrets, the canonical secrets recipe, set up canonical secrets, ~/.config/dev-secrets
description: The recipe for setting up the canonical secrets file at ~/.config/dev-secrets/secrets.env — the single source of truth for personal API keys.

## ElevenLabs RAG recipe
url: /recipes/add-rag-to-elevenlabs-agent.html
triggers: ElevenLabs RAG, add RAG to ElevenLabs, the RAG recipe
description: The recipe for adding a knowledge base of URLs to an ElevenLabs Conversational AI agent.

## HeyGen avatar recipe
url: /recipes/add-avatar-to-site.html
triggers: HeyGen avatar, add an avatar to a site, the avatar recipe
description: The recipe for adding a HeyGen avatar widget to a static site.

## ElevenLabs client-tool recipe
url: /recipes/register-elevenlabs-client-tool.html
triggers: ElevenLabs client tool, register a client tool, the client-tool recipe
description: The recipe for registering a client-side tool with an ElevenLabs Conversational AI agent.

## Garage Door Science (the operator's other site)
url: https://garagedoorscience.com
triggers: garagedoorscience.com, garage door science
description: Seth's primary product/site. Used in author bios and when posts reference work happening there.
