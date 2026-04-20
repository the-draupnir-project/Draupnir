---
"@the-draupnir-project/matrix-protection-suite": minor
---

Projections now produce the next node in a single step, which simplifies their
implementation.

Previously we thought that the two-step system had stronger guarantees for
correctness when persisting projection nodes, but we found in implementation
that the two approaches were almost identical, with two-step being needlessly
complicated https://github.com/the-draupnir-project/planning/issues/120
