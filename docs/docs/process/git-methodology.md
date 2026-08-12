---
sidebar_position: 1
---

# Git Methodology

This document defines how our team works with Git for this project. It covers commit conventions, branching, merging, and versioning.

---

## 1. Commit Message Format (Conventional Commits)

We use the [Conventional Commits](https://www.conventionalcommits.org/) format. The description after the type should be a short, lowercase phrase in the **imperative mood**.

Every commit must follow this format, including documentation, test, maintenance, and squash-merge commits.

### Format

```
<type>[optional scope][!]: <description>

[optional body, if more context is needed]

[optional footer(s)]
```

Common types:

- `feat`: add or change user-facing functionality.
- `fix`: correct a bug.
- `test`: add or update tests.
- `docs`: change documentation only.
- `chore`: perform maintenance that does not change application behavior.
- `refactor`: restructure code without changing its behavior.

Use an optional scope when it makes the affected area clearer, for example `feat(auth): add Google OAuth login`. Mark a breaking change with `!` before the colon and explain it in a `BREAKING CHANGE:` footer.

When AI generated code in the commit, add an `Assisted-by:` footer naming every contributing tool and model, as required by the project's AI policy. AI in-line editing and AI code review do not require a footer on every commit, but all code-generation, in-line-editing, and code-review tools and models must be attributed in the repository's `README.md`. Use explicit non-usage statements there for categories the team does not use.

Submitted documents must end with either an AI usage declaration naming the purpose, every tool, and every model, or the policy's explicit non-usage declaration. Start a new AI session for each assessment and retain an unedited transcript or the tool's saved files when required.


### Examples

```
feat(auth): add Google OAuth login option

fix(cart): calculate discounted total correctly

docs: update setup instructions for new developers

chore: remove unused date-picker dependency

chore(deps): bump React to 18.3.1

feat(events): add score endpoint

Assisted-by: ChatGPT-Web[GPT-5.6 Thinking]

fix(sync): prevent duplicate offline entries

Assisted-by: Claude-Code[Claude Sonnet 5], ChatGPT-Web[GPT-5.5]
```

---

## 2. Branching Strategy (GitHub Flow)

We use **GitHub Flow** — simple, fast, and well-suited to a small team shipping continuously to a web app.

### The rules

1. **`main` is always deployable.** Nothing broken ever sits on `main`.
2. **Branch off `main` for any work.** New feature, bug fix, experiment — all get their own branch.
3. **Name branches descriptively**, using a type prefix:
   ```
   feature/checkout-page
   fix/cart-total-bug
   chore/upgrade-node
   ```
4. **The agent commits; the developer branches and pushes.** In agent-driven sessions, the agent creates every commit on the branch — following the Conventional Commits format and adding the required `Assisted-by:` footer — while the developer's only Git responsibilities are creating the branch, pushing it, and reviewing/merging the PR (see "Agent-Assisted Workflow" below).
5. **Open a Pull Request (PR) early** — even as a draft. This invites feedback before you've gone too far in the wrong direction.
6. **Get at least one review** before merging. 
7. **Once approved and passing checks (tests/build), merge into `main`.**
8. **Deploy from `main`** right after merging, or as part of your CI/CD pipeline.
9. **Delete the branch** after merging to keep the repo tidy.

### Agent-Assisted Workflow

In an agent-assisted session the division of labor is fixed, so there is only ever one entity creating commits:

| Who | Does |
|---|---|
| **Developer** | Creates the branch off `main`, pushes the branch, opens the PR, reviews the diff, and merges the PR once approved and green. |
| **Agent** | Writes all code and creates all commits on the branch, using Conventional Commits and adding an `Assisted-by:` footer to every commit where it generated code. |

Repeat the cycle whenever review feedback needs landing: the developer asks the agent to make changes, the agent edits and commits on the same branch, and the developer pushes again.

---

## 3. Merging

Standard merge process

1. **Keep your branch up to date** with `main` while you work, to minimize conflicts:
   ```bash
   git checkout feature/checkout-page
   git fetch origin
   git merge origin/main
   ```
   (or `git rebase origin/main`)

2. **Resolve conflicts locally**, test, and push before merging the PR.

3. **Merge via Pull Request on GitHub**, not directly from the command line.

4. **Merge strategy:**
   - Use **"Squash and merge"** for feature/fix branches with messy or WIP commit history — this keeps `main`'s history clean. Before merging, ensure the squash commit title follows the Conventional Commits format above and retains every required `Assisted-by:` footer.
   - Use a regular **merge commit** if the branch's individual commits are already clean and meaningful and you want to preserve that history. Give the merge commit a Conventional Commit subject as well.
   - Avoid `git push --force` on shared/`main` history — only force-push your own feature branch, and only if no one else is working on it.

5. **Delete the branch** after merge.

---

## 4. Versioning (Semantic Versioning)

We use [Semantic Versioning (SemVer)](https://semver.org/): `MAJOR.MINOR.PATCH`, e.g. `1.4.2`.

| Segment | Bump when...                                                        |
|---------|----------------------------------------------------------------------|
| `MAJOR` | You make incompatible/breaking changes                              |
| `MINOR` | You add functionality in a backwards-compatible way                 |
| `PATCH` | You make backwards-compatible bug fixes                             |

### In practice

- Track the version in `package.json` (or equivalent).
- Tag releases in Git when you cut a version:
  ```bash
  git tag -a v1.4.2 -m "Release 1.4.2"
  git push origin v1.4.2
  ```
- Pre-1.0 (`0.x.y`): expect breaking changes at any time — this is fine while the app is early/unstable.
- Once the app is in production and stable, move to `1.0.0` and follow SemVer strictly from there.

---

## Quick Reference

```
# Start new work
git checkout main
git pull
git checkout -b feature/short-description

# The agent writes code and commits on the branch
# (Conventional Commits + Assisted-by: footer) — no manual git add/commit needed

# Stay in sync
git fetch origin
git merge origin/main

# Push and open a PR on GitHub
git push -u origin feature/short-description

# After PR approval → squash & merge on GitHub → delete branch

# Tag a release (on main, after merging)
git tag -a v1.2.0 -m "Release 1.2.0"
git push origin v1.2.0
```
---

## AI Declaration

The preceding document was generated with the assistance of Claude-Web[Sonnet 5] and edited with the assistance of Codex[GPT-5], opencode[deepseek-v4-flash-free].
