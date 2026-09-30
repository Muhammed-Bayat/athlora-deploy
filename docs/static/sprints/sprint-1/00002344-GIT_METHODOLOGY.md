# Git Methodology

This document defines how our team works with Git for this project. It covers commit conventions, branching, merging, and versioning.

---

## 1. Commit Message Format (Imperative Short Phrases)

We keep commit messages simple: a short phrase in the **imperative mood**, like an instruction telling the codebase what to do.
### Format

```
<Short imperative summary>

[optional body, if more context is needed]
```



### Examples

```
Add Google OAuth login option

Fix cart total calculation with discounts

Update README setup instructions for new devs

Remove unused date-picker dependency

Bump React to 18.3.1
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
4. **Commit to your branch regularly** and push often so others can see progress and you don't lose work.
5. **Open a Pull Request (PR) early** — even as a draft. This invites feedback before you've gone too far in the wrong direction.
6. **Get at least one review** before merging. 
7. **Once approved and passing checks (tests/build), merge into `main`.**
8. **Deploy from `main`** right after merging, or as part of your CI/CD pipeline.
9. **Delete the branch** after merging to keep the repo tidy.


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
   - Use **"Squash and merge"** for feature/fix branches with messy or WIP commit history — this keeps `main`'s history clean, with one commit per PR that follows the short imperative format above.
   - Use a regular **merge commit** if the branch's individual commits are already clean and meaningful and you want to preserve that history.
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

# Commit
git add .
git commit -m "Add short imperative summary of change"

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

The preceding document was generated with: Claude-Code[Sonnet 5]
