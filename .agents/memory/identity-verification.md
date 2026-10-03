---
name: Identity verification design
description: Previously chosen policies for the app's identity and moderation flow.
---

- Do not require government ID for identity verification.
- The selfie flow uses a smile and head-turn prompt, not blink detection.
- Device fingerprints are used for device bans.
- Keep `isBanned` and `isSuspended` as distinct states.
- The admin review queue supports approve, ban, and device-ban actions.

**Why:** These are established product decisions; their detailed rationale was not recorded.

**How to apply:** Preserve these behaviors when changing identity verification or its moderation workflow unless the user changes the policy.