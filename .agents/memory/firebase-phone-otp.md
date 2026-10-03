---
name: Firebase phone OTP
description: Trust boundaries and retry behavior for phone verification and phone signup.
---

- A phone number is verified only after the server validates a Firebase ID token whose verified phone claim matches the requested number. Never accept a client-supplied verification flag.
- Do not link an OTP challenge to whichever Firebase account happens to be active in the browser; link only when that Firebase identity corresponds to the local account.
- If Firebase accepts the one-time code but local account synchronization fails, retain the confirmed Firebase user so the app can retry synchronization without consuming the code again.
- Phone signup asks for a password and existing phone/password login depends on it; carry it through verified signup and store only its server-side hash.
- A successful build does not prove SMS delivery. Firebase Phone provider settings, authorized domains, quotas, and delivery still need an end-to-end real-phone check.

**Why:** Firebase consumes OTPs at confirmation, so an unrelated server failure must not make users re-enter a consumed code. Server-validated phone claims prevent clients from marking unverified numbers as verified, and retaining the signup password keeps the existing login contract.

**How to apply:** Keep these rules consistent across onboarding, profile verification, and any future phone-auth flow. Diagnose delivery separately from code confirmation and local session/account synchronization.