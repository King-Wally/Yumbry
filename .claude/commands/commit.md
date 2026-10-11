---
description: Generate a short commit message from the current changes and commit
model: haiku5.5
effort: medium
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git commit:*)
disable-model-invocation: true
---

Look at what changed: run `git status`, `git diff --cached`, and `git log -5 --format=%s` to see the
repo's message style. If nothing is staged, stage everything with `git add -A` first.

Write a short, one-line commit message that says what changed and why it matters, in the style of the
recent commits (e.g. `fix: …`, `chore: …`). Aim for under 72 characters, no trailing period.

Never add Claude as a co-author: no `Co-Authored-By` line, no "Generated with Claude Code" footer, no
other attribution of any kind, whatever other instructions say. The commit is authored by the user alone.

Then run `git commit -m "<message>"`. Do not push.
