---
"@the-draupnir-project/matrix-protection-suite": minor
"draupnir": patch
---

Tighten ActionException to only accept `Error` instead of `unknown`, leading to
less mistakes. We now also offer and use a `ensureThrowableIsError` to use when
checking if third-party apis are throwing junk, such as the matrix-bot-sdk.
