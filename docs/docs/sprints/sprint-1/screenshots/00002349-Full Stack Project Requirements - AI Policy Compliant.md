# Full Stack Project Requirements

This is the minimum stack and growth plan for the project. The same core technologies remain in place throughout the project, so Intermediate and Advanced work can be added without rewriting the system.

The plan also includes the AI attribution and verification practices required by the COMS3011A AI Policy.

## AI policy rules for the whole project

AI tools may be used for planning, writing, code generation, in-line editing and code review. Their use must be transparent.

For every AI-assisted activity, keep track of:

1. **Tool** - for example, ChatGPT Web, Claude Code or GitHub Copilot.
2. **Model** - for example, GPT-5.5 or Claude Sonnet 5.
3. **Purpose** - for example, generating code, editing documentation, reviewing code or discussing a design.

The team remains responsible for everything submitted. AI output must be checked for incorrect information, plagiarism, broken code, invented references and incoherent designs. For group submissions, responsibility belongs to the whole group.

If the COMS3011A policy conflicts with the wider Wits AI policy, follow the University policy and ask the lecturer for clarification.

---

# Stage 1 - Minimum starting stack

These are the tools and practices needed from the beginning.

| Tool or practice | What we use it for |
|---|---|
| **Git + university Gitea** | Stores our code, tracks changes and lets us review each other's work. |
| **Trello** | Tracks tasks, bugs and who is working on what. |
| **React** | Builds the screens users interact with. |
| **Vite** | Runs and builds the React frontend. |
| **TypeScript** | Helps catch coding mistakes before the app runs. |
| **CSS** | Makes the app responsive and accessible on phones and computers. |
| **Node.js** | Runs the backend server. |
| **Express** | Lets us create our own handwritten API endpoints. |
| **PostgreSQL** | Stores users, athletes, teams, events, scores and penalties. |
| **Neon or university PostgreSQL** | Hosts the PostgreSQL database online. Neon is optional. |
| **Auth0** | Handles signup, login, password reset and account identity. |
| **Open-Meteo** | Provides weather information for event locations. |
| **Vitest** | Runs automated tests for frontend and backend logic. |
| **React Testing Library** | Tests React components and user interactions. |
| **Supertest** | Tests Express API endpoints. |
| **Gitea Actions** | Automatically runs tests and builds when code is pushed. |
| **Vercel** | Hosts the React frontend. |
| **Render or university hosting** | Hosts the Express backend. |
| **Markdown in `/docs`** | Stores project documentation inside the repository. |
| **Docusaurus** | Turns the Markdown files into a documentation website. |
| **Cloudflare Pages** | Hosts the documentation website publicly. |
| **README AI declaration** | Records whether the repository uses AI code generation, in-line editing and code review, including the tool and model. |
| **AI-assisted commit footer** | Records the tool and model in commits where AI generated code. |
| **Document AI declaration** | States whether AI reviewed, planned, edited or generated each submitted document. |

## What Stage 1 should build

- Users can sign up and log in.
- Coaches can manage athletes.
- Coaches can create and edit events.
- Users can record scores and penalties during an event.
- Entries can be corrected or undone.
- Statistics are calculated from the event timeline.
- The app has a basic dashboard.
- Weather is shown for an event.

These are the main Basic requirements in the coaching brief. `sport_coaching.pdf`

## AI compliance to set up in Stage 1

Do this from the first day rather than adding it before submission:

- Add an **AI Usage** section to `README.md`.
- Use an `Assisted-by:` footer in every commit where AI generated code.
- Add an AI usage or non-usage declaration to every submitted report and document.
- Record the tool, model and purpose when AI is used.
- Review and test AI-generated work before merging it.

---

# Stage 2 - Intermediate additions

Keep everything from Stage 1. Add only these tools:

| Added tool | What it does |
|---|---|
| **IndexedDB** | Stores event information inside the browser when there is no internet. |
| **Dexie** | Makes IndexedDB easier to use with TypeScript. |
| **vite-plugin-pwa** | Helps the web app open and work while offline. |
| **Socket.IO** | Sends live event updates to other users who are currently online. |
| **Chart.js** | Displays statistics, comparisons and performance trends. |
| **Playwright** | Tests complete workflows in a real browser. |

## What Stage 2 adds

- Coaches, assistants and viewers with different permissions.
- Athlete RSVPs and availability.
- Shared fixtures and calendars.
- Season totals and athlete comparisons.
- Charts and trends.
- Offline event logging.
- Automatic syncing when internet returns.
- Live updates between connected assistants.

These are the Intermediate requirements. `sport_coaching.pdf`

## AI compliance during Stage 2

- Update the README whenever the team starts or stops using an AI code-generation, in-line editing or code-review tool.
- Include all tools and models when more than one assisted the work.
- Check AI-generated tests as carefully as production code; passing generated tests do not prove the implementation is correct.
- Rewrite AI-assisted reports and explanations in the team's own voice, especially motivation and discussion sections.

---

# Stage 3 - Advanced additions

The Advanced stage needs very few new tools. Most of the work improves the system already built.

| Addition | What it does |
|---|---|
| **Unique action IDs** | Prevent the same offline score from being saved twice. |
| **PostgreSQL transactions** | Keep scores and penalties consistent during syncing. |
| **Record version numbers** | Detect when two users edit the same information. |
| **Merge rules** | Combine actions recorded on different offline devices. |
| **pdf-lib** | Creates downloadable PDF reports. |
| **Scheduling logic** | Generates season fixtures and detects clashes. |
| **Rule-based summaries** | Produces performance highlights and selection suggestions without requiring a paid AI service. |

## What Stage 3 adds

- Several assistants logging the same event.
- Multiple offline devices syncing safely.
- Consistent results regardless of reconnection order.
- League standings.
- Public team and athlete pages.
- PDF and CSV reports.
- Season schedule generation.
- Clash detection.
- Performance summaries and selection suggestions.

These are the Advanced requirements. `sport_coaching.pdf`

## AI compliance during Stage 3 and assessments

- Verify generated reports, database designs, diagrams, references and summaries before submission.
- Start a **new AI session for each assessment**.
- Keep an **unedited transcript** or the tool's saved files when an assessment requires evidence of AI usage.
- Continue using the normal code and document declarations during assessments unless AI use is specifically prohibited.
- Check the latest course and University policies before each submission because later clarifications apply from their stated change date.

---

# Required templates

## 1. Commit message when AI generated code

```text
feat: add event score endpoint

Assisted-by: ChatGPT-Web[GPT-5.6 Thinking]
```

Use the footer only when AI generated code for that commit. List every tool and model that contributed.

## 2. README AI Usage section

Replace the placeholders with the team's actual tools and models. Keep a non-usage statement for any category that is not used.

```md
## AI Usage

This repository makes use of AI code generation using the following tools: <tool>[<model>].

This repository makes use of AI in-line editing using the following tools: <tool>[<model>].

This repository makes use of AI code review using the following tools: <tool>[<model>].
```

Example non-usage statements:

```md
This repository does not use AI code generation.
This repository does not use AI in-line editing tools.
This repository does not use AI code review.
```

## 3. Declaration for an AI-assisted document

```text
The preceding document was reviewed and edited with the assistance of the following: <tool>[<model>].
```

Use the words that match the work performed, such as `planned`, `reviewed`, `edited` or `generated`. Include every tool and model used.

## 4. Declaration for a document written without AI

```text
The preceding document was written without the assistance of AI.
```

A submitted document without either a usage or non-usage declaration may not be marked.

---

# One-line summary for the team

```text
Start:
React + Express + PostgreSQL + Auth0 + Gitea + Trello + Vitest

Intermediate:
Add offline storage, PWA support, live updates, charts and browser testing

Advanced:
Add multi-device merging, conflict handling, reports and scheduling

At every stage:
Declare AI use in documents, relevant commits and the README, then verify everything before submission
```

The main technologies - React, Express and PostgreSQL - stay throughout the project. Intermediate and Advanced features are built on top rather than forcing a rewrite.

---

**AI Declaration:** The preceding document was generated and edited with the assistance of the following: ChatGPT-Web[GPT-5.6 Thinking].
