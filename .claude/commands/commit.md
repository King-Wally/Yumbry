---
description: Generate a commit message from staged changes and commit
model: haiku
allowed-tools: Bash(git add:*), Bash(git status:*), Bash(git diff:*)
disable-model-invocation: true
---

Look at the currently staged changes (run `git status` and `git diff --cached`).
If nothing is staged, stage all changes with `git add -A` first.

Write a concise commit message (one line) that describes what changed. Do not add a Claude Code
footer or co-author line. Then run `git commit` with that message.
