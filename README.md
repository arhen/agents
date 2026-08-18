# ~/.agents — Arhen's global agent config

Single source of truth for agent instructions + curated skills. Cloned to `~/.agents/`, symlinked by pi and Claude Code.

## Contents

- `AGENTS.md` — global instructions (rtk token efficiency, fff search, caveman ultra mode)
- `skills/` — 10 curated global skills (caveman family, compress, impeccable, find-skills)

## Setup on a new machine

```sh
git clone git@github.com:arhen/agents.git ~/.agents

# pi
ln -s ~/.agents/AGENTS.md ~/.pi/agent/AGENTS.md
ln -s ~/.agents/AGENTS.md ~/.claude/CLAUDE.md

# skills (symlink farm, one per entry)
cd ~/.pi/agent/skills && for e in ~/.agents/skills/*; do ln -s "../../../.agents/skills/$(basename "$e")" "$(basename "$e")"; done
cd ~/.claude/skills && for e in ~/.agents/skills/*; do ln -s "../../.agents/skills/$(basename "$e")" "$(basename "$e")"; done
```

## Update

Edit `AGENTS.md` or `skills/` locally → `git push` → pull on other machines. Symlinks mean no re-link needed after update.
