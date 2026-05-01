---
name: Content Triangle Offense
description: Automated pipeline for Brain Vault -> Site + Video
type: project
---

# Project Goal
Automate the daily and weekly publishing of content from the Brain Vault to sethshoultes.github.io, accompanied by HeyGen talking-head videos and Remotion technical demos.

## The Pipeline
1. **Selection**: Phil Jackson selects 'Idea of the Day' from Brain Vault $\rightarrow$ `daily-brief.md`.
2. **Composition**: Rotating `great-authors` persona writes the post and a Video Narrative Map.
3. **Visuals**: `great-filmmakers` produce HeyGen intro/outro and Remotion technical sequences.
4. **Deployment**: `great-minds` DevOps pushes the Jekyll post and assets to GitHub.

## Voice Strategy
- **Rotating Personas**: Use a variety of author personas from the constellation to keep the feed dynamic.
- **Soul Guardrail**: All content must adhere to the core thesis defined in the `daily-brief.md`.
- **The Avatar**: Main avatar is Seth, using Seth's canonical voice.

## State Tracking
- **Daily Brief**: `daily-brief.md` (The current target).
- **Voice Log**: `voice-rotation.json` (Tracks who wrote what and when).
- **Asset Map**: Tracks the status of video renders.
