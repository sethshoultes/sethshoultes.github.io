---
slug: the-deploy-told-you-nothing
title: The Deploy Told You Nothing
voice: orwell
status: active
date: 2026-04-30
---

# Brief: The Deploy Told You Nothing

## The Claim
A successful build, a successful deploy, and a working preview URL are three different lies a platform will tell you about whether your customers can reach your code; the only verification that counts is a GET against the production custom domain that exercises the new path.

## The Material
- **The 525 Incident**: Cloudflare 525 on every path. The deploy reported success, the preview URL worked, but the production domain was a wall.
- **The Layers of Lies**:
    - Build Lie: "The artifact is ready."
    - Deploy Lie: "The artifact has landed on the host."
    - Preview Lie: "This specific instance works."
    - DNS/Edge Lie: "The domain points to the right place."
- **The Root Cause**: Zone and Worker were on different accounts. The platform reported the Worker was deployed, but the DNS zone didn't recognize it.
- **The Truth**: The only signal that doesn't lie is a GET request to the production custom domain.

## Required References
- ~/brain/learnings/post-deploy-verify-the-production-domain.md
- ~/brain/learnings/cloudflare-525-zone-mismatch.md
- ~/brain/learnings/cloudflare-worker-custom-domain-needs-zone-account-match.md
- ~/brain/learnings/code-review-is-not-qa.md

## Delivery
- **Format**: Jekyll blog post (_posts/YYYY-MM-DD-slug.html)
- **Assets**: Featured image in `blog/images/the-deploy-told-you-nothing-featured.png`, HeyGen/Remotion assets.
- **Voice**: Orwellian — clinical, precise, precise, precise. No fluff. No adjectives. Focus on the structural reality of the system.
