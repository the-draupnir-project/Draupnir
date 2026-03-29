---
"@the-draupnir-project/matrix-protection-suite": patch
"draupnir": patch
---

Fixed a bug where User policies of any recommendation would result in the
MemberBanSynchronisationProtection banning users. This is was a particularly
important issue for compatibility with Meowlnir.
