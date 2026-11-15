# Gundam Hangar

**CS184 Final Project (Fall 2026).** An interactive Gundam customization and animation system: a desktop web app first, then adapted to Apple Vision Pro.

> The repository now includes a runnable **desktop single-arm prototype**, alongside the project plan and proposal website. See [the prototype guide](docs/DESKTOP-PROTOTYPE.md) and [current progress](docs/PROGRESS-2026-11-14.md).

## Run the desktop prototype

```sh
npm ci
npm run dev
```

Use `npm test` for animation checks and `npm run build` for strict TypeScript checking and production output. The current prototype supports the supplied model, shoulder/elbow/wrist controls, a raise-arm animation, and source/processed asset comparison. Vision Pro and the full customization feature set are still future work.

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

## Planning and reporting layout

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

`src/`, `public/`, `scripts/`, `tests/`, and the root package files now implement the first desktop slice. Module responsibilities follow [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); the limited asset adapter is documented in [docs/DESKTOP-PROTOTYPE.md](docs/DESKTOP-PROTOTYPE.md).
