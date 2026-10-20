---
name: dev-null
description: "Show /dev/null, the developers' commit social network at dev-null.sh, in a Herdr pane as a commit timeline. Use when the user says open dev-null, show dev-null, what's on /dev/null, the dev-null feed, or asks for its latest or trending commits. Also use to read /dev/null as plain text, or to reply to a commit there."
---

# /dev/null in a pane

`/dev/null` is a social network where every post is a commit. Its feed is the
commit timeline this skill opens: each author's lane colour runs down the rail,
with the avatar, name, handle, time, short hash, body, quote, replies and link
preview of each commit. A body longer than five lines is clamped in the log,
replies included; `enter` opens the commit and the whole of it.

The Herdr plugin `devnull.feed` lives in
`~/Code/personal/herdr-devnull-plugin` and is linked into Herdr as a local
plugin. Do not rebuild it: run it.

## Open it for the user

From a pane, target that pane so the feed lands next to it:

```sh
herdr plugin pane open --plugin devnull.feed --entrypoint feed \
  --direction right --target-pane "$HERDR_PANE_ID" --focus
```

`herdr plugin action invoke devnull.feed.open` does the same, but an action
invoked from the CLI carries no caller pane, so the pane may land in whichever
workspace the user is looking at. Prefer the explicit command above unless the
user is running the action from the command palette or its keybinding.

The pane title is `/dev/null`.

The user drives that pane:

- `j`/`k` or the up/down arrows select a commit, `enter` or `→` opens it with
  its replies, `e` expands a reply's own replies, `esc` or `←` goes back one
  level, `o` opens the commit in a browser, `a` cycles the avatar style.
- `R` replies to the selected commit, `c` commits something new. Both are signed
  with the user's SSH key and posted to dev-null.sh as their account, exactly
  like `curl -fsSL https://dev-null.sh/commit | bash`. The composer takes `@`
  mentions (people on screen, then /dev/null's search; `↑`/`↓`, `tab` or
  `enter` to pick one) and attaches dropped or pasted JPEG, PNG and WebP files
  (up to 3, 10 MB each), as the website's composer does; `enter` sends,
  `shift+enter` starts a new line.
- `r` refreshes, `t` switches latest/trending, `?` shows keys, `q` closes.

Do not press `R`/`c` and type on the user's behalf: writing to their dev-null
account is their call.

Stars, pastéis, follows and bookmarks are not available from a terminal: they
need a device key approved under `https://dev-null.sh/settings/devices`, and the
plugin does not fake them.

## Read it yourself

Plain text, no colour, nothing interactive:

```sh
node ~/Code/personal/herdr-devnull-plugin/index.js --once --log latest --width 100
```

`--log trending` for the ranked log. The plugin's actions print the same into
the plugin log:

```sh
herdr plugin action invoke devnull.feed.latest
herdr plugin log list --plugin devnull.feed --limit 1
```

For the rendered page, open the real URL in a Herdr browser tab instead:

```sh
/Applications/Herdr.app/Contents/MacOS/Herdr browser open https://dev-null.sh/log/latest
```

## Where the data comes from

`https://dev-null.sh/log/{latest,trending}` server-renders 20 commits as an
Inertia `data-page` JSON blob; the plugin reads that blob and draws the
timeline. A commit page (`/@user/commits/{id}` with
`Cookie: replies_per_page=25`) carries the conversation. No login, no API key.
`/api/v1/log/{log}` needs an SSH-signed device, so do not reach for it, and
`Following` needs the user's session: latest and trending only.

If the plugin is missing, link it again:

```sh
herdr plugin link ~/Code/personal/herdr-devnull-plugin
```
