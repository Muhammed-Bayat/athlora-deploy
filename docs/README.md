# Athlora Documentation Site

## Core Requirements

### Project Title

**Athlora Documentation Site**

### Short Description

This Docusaurus site documents the Athlora architecture, API contract, database rules, setup, quality checks, and delivery roadmap. It is the project’s published technical reference and is deployed independently from the application.

### System Requirements

- Node.js 22 LTS recommended; Node.js 20 or later supported.
- npm.

## Installation Guide

```bash
cd docs
npm install
npm run start
```

The development server normally runs at `http://localhost:3000`.

## Usage Examples

Build the static site and fail on broken links:

```bash
npm run build
```

Preview the generated site:

```bash
npm run build
npm run serve
```

Add a guide by creating a Markdown file in `docs/docs`, then add its document ID to `sidebars.ts`. Run `npm run build` before opening a pull request.

## Scripts

| Command | Purpose |
|---|---|
| `npm run start` | Start Docusaurus in development mode. |
| `npm run build` | Generate `build/` and validate links. |
| `npm run serve` | Serve the generated site locally. |
| `npm run clear` | Clear Docusaurus caches. |
| `npm run typecheck` | Type-check the site configuration. |

The published site is https://athlora-deploy.pages.dev.

## AI Declaration

This document was created with the assistance of opencode[deepseek-v4-flash-free] and opencode[gpt-5.6-sol], and updated with the assistance of OpenCode[gpt-5.6-terra].
