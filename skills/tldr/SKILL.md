---
name: tldr
description: >
  Condense the current session into a short, scannable summary. Two sections: work
  completed and status of the last task. Use when the user asks "what have we done",
  "tldr", "recap", "summarize the session", "where are we", or invokes /tldr.
---

Write the summary in ASD-STE100 Simplified Technical English. This is mandatory. It
overrides caveman mode, wenyan mode, and all other output styles for the summary text.

## STE rules

- Use one approved meaning for each word. Use "start", not "initiate" or "kick off".
- Use the active voice. Write "The agent changed the file", not "The file was changed".
- Use short sentences. Maximum 20 words for procedures, 25 words for descriptions.
- Use one idea in each sentence.
- Use the present tense or the simple past tense.
- Do not use idioms, metaphors, or slang.
- Do not omit articles. STE keeps "the" and "a".
- Use the same term for the same thing each time. Do not use synonyms.

## Output format

```
## Done

- <action> <object>. <result>.
- ...

## Current task

- Task: <name>
- Status: <complete | in progress | blocked>
- Last step: <what the agent did last>
- Next step: <what the agent must do next>
- Blocker: <cause> (only if the status is blocked)
```

## Content rules

- Keep the core instructions of the user. Remove all repeated text.
- Keep the decisions and the reason for each decision.
- Keep file paths, commands, function names, and error strings exactly as written.
- Remove the tool call narration. Keep only the result.
- Make the length agree with the complexity. A small session gets 3 to 5 bullets.
  A large session gets more, but each bullet stays on one line.
- If the session has no completed work, write "No work is complete." Do not invent items.
