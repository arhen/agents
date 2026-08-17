---
name: answer
description: >
  Structured answer workflow. Trigger: any non-trivial question/task.
  Identify the real ask, verify assumptions, break into sub-steps,
  synthesize into one precise answer.
---

# Answer

Follow this flow for any non-trivial question or task.

1. **Identify** — restate the actual ask in one line. Fix ambiguity before doing work. YAGNI: cut speculative scope.

2. **Verify** — check assumptions against real state (read files, run commands, check sources). Do not answer from memory or assumption when evidence is available.

3. **Break down** — decompose the verified task into discrete ordered sub-steps. Each step has one outcome. Skip steps that evidence already rules out.

4. **Synthesize** — reassemble steps into a single precise answer. Lead with the conclusion, then the evidence, then (if asked) the method. No rambling.

**Rule:** never report a step complete without its check having passed.