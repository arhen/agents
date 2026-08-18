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
- Give a pointer for each item that has more detail somewhere else. Use the file path,
  the URL, the pull request number, or the commit SHA. Put the pointer in the same line.
  This lets the reader find the full record. It also keeps the bullet short.
  Example: `- Merged 3 pull requests. See #446, #340, #190.`
- Remove the tool call narration. Keep only the result.
- Obey the hard limits. Do not go above them:
  - `## Done`: 5 bullets maximum. One line for each bullet. 15 words maximum.
  - `## Current task`: 5 fields maximum. One line for each field.
  - Total: 15 lines maximum.
- Group the related items into one bullet. Do not make one bullet for each commit.
- Write the result only. Do not write the cause, the method, or the review history.
- Do not use tables, sub-bullets, or code blocks.
- If the content is too large for the limits, keep the items with the highest risk.
  Give the path to the full record instead of the details.
- If the session has no completed work, write "No work is complete." Do not invent items.

## Example

A long session with 3 merged pull requests and 4 review rounds becomes this:

```
## Done

- Merged 3 pull requests: web #446, api #340, ai-service #190.
- Fixed the GenUI font scale in `tailwind.config.ts`. See commit 0d4318410.
- Added the Stop button and the per-thread streaming. See commit 09eb0422d.
- Corrected 10 review findings. All threads are closed.
- Verified the tests after the merge. All 3 services pass.

## Current task

- Task: Follow-up work after the merge
- Status: blocked
- Last step: The agent merged all branches and deleted them.
- Next step: Create the `show-concurrent-chat-streaming` flag in PostHog.
- Blocker: Stopped turns bill zero. ai-service must send the token usage.
```
