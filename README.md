# Mecha Hangar

**CS184 Final Project (Fall 2026).** An interactive mecha customization and animation system: a desktop web app first, then adapted to Apple Vision Pro.

> This repository currently holds only the **plan and the framework design**. Implementation is done task by task using the cards in `docs/tasks/` (written by team members, or by AI coding tools such as dsh or Antigravity).

## Where to start

| You want to… | Read |
|---|---|
| Understand the goals, schedule and division of work | [docs/PLAN.md](docs/PLAN.md) |
| Understand the code structure, module boundaries and coordinate conventions | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Pick the next piece of work | [docs/tasks/README.md](docs/tasks/README.md) |
| Learn how to use Git / GitHub as a team | [docs/WORKFLOW.md](docs/WORKFLOW.md) |
| Hand a task to an AI coding tool | [AGENTS.md](AGENTS.md) (have the tool read it first) |
| Record progress / issues / experiment data | [docs/progress.md](docs/progress.md), `docs/results/` |
| Record asset and code sources (required by the course) | [docs/asset-sources.md](docs/asset-sources.md) |

## Repository layout (current)

```
Final_Project/
├── AGENTS.md            # rules for AI coding tools (read first)
├── README.md
├── docs/
│   ├── PLAN.md          # scope, milestones, weekly plan, roles, evaluation, risks
│   ├── ARCHITECTURE.md  # target code layout, interfaces, conventions
│   ├── WORKFLOW.md      # git workflow for the team
│   ├── tasks/           # task cards T01–T12, each with acceptance criteria
│   ├── progress.md      # running log
│   ├── asset-sources.md # attribution for every external asset / code source
│   └── results/         # evaluation CSVs, plots, screenshots
├── assets-src/          # Blender source files (.blend)
└── website/             # proposal / milestone / final pages (GitHub Pages)
```

`src/`, `public/`, `package.json` and so on are created by task **T01** following [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
