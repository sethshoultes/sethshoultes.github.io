# The talk@ inbox (#183)

Mail to `talk@mail.sethshoultes.com` lands in a Resend Inbox. An agent in that inbox writes a **draft** reply; nothing is sent until Seth sends it.

## Read and approve drafts

1. Open the Resend dashboard, **Inboxes**, **talk@mail.sethshoultes.com**.
2. Open a thread. A draft the agent wrote opens in the reply composer with a badge saying the agent wrote it.
3. Edit it if you like, then **Send**, or discard it. Over the API: `GET /inboxes/{id}/drafts` lists drafts and `POST /inboxes/{id}/drafts/{draft_id}/send` sends one.

## What the agent may do

Only `draft_reply` and `add_labels`. It cannot send, forward, archive or delete (`PATCH /inboxes/{id}/agent`, field `actions`). Its instructions (4,000 characters at most) tell it to answer only from facts and pages listed there and to cite a real post by link; it has no web access, so a post must be in the instructions to be cited. To add a post, edit the instructions in the dashboard (Settings, Customize) or by API.

## How it is set up

- The inbox lives on the receiving subdomain `mail.sethshoultes.com`. Its five DNS records (MX `mail`, MX and SPF TXT on `send.mail`, CNAME `rsend.mail`, DKIM TXT `resend._domainkey.mail`) are DNS-only in Cloudflare. Nothing is changed at the root `sethshoultes.com`.
- It uses the existing `RESEND_API_KEY` (HerdOS vault); no new key.
- Tested 2026-11-04: a message from `test-sender@mail.sethshoultes.com` produced an unsent draft linking four real posts.
