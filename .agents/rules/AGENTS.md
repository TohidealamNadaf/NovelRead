# AGENTS.md
# Agent Rules — React 19 + Vite + TypeScript + Tailwind v4 + Capacitor 8

## Mission

Implement the requested change with the smallest correct architectural change.

Do not optimize for the fewest lines of code. Optimize for:

- correct ownership;
- predictable dependencies;
- mobile reliability;
- testability;
- maintainability.

## REQUIRED BEFORE EDITING

1. Read `package.json`.
2. Inspect the relevant `src/` feature.
3. Search for an existing implementation of the requested behavior.
4. Check existing `app/`, `domain/`, `infra/`, `platform/`, `features/`, and `shared/` boundaries.
5. Inspect existing tests before changing behavior.
6. If native behavior is involved, inspect `capacitor.config.ts` and the relevant plugin/native configuration.
7. Determine whether the behavior must work:
   - web only;
   - native only;
   - both web and native.

## CHANGE CLASSIFICATION

Classify the task before choosing where to edit:

| Request | Preferred location |
|---|---|
| visual primitive | `shared/components` |
| feature screen | `features/<feature>/pages` |
| feature UI | `features/<feature>/components` |
| feature workflow | `features/<feature>/services` / `hooks` |
| business rule | `domain/` |
| API access | `infra/api` |
| persistence | `infra/persistence` |
| offline sync | `infra/sync` |
| native capability | `platform/` |
| app-wide routing/provider | `app/` |
| generic utility | `shared/` |

## DO NOT

Do not:

- create a new state library without need;
- create a second API client;
- create a second storage system for the same data;
- import Capacitor plugins directly into arbitrary UI;
- put business rules inside JSX;
- put network calls in presentational components;
- put domain logic in `App.tsx`;
- store derived state;
- use `any` as a shortcut;
- disable lint/TypeScript rules to make checks pass;
- put secrets in client environment variables;
- modify generated native files without checking ownership;
- perform unrelated refactors during a feature task;
- create `utils.ts`, `helpers.ts`, `common.ts` dumping grounds;
- introduce a dependency for functionality already available from the project or platform.

## REACT RULES

### State

Keep state local until there is a real cross-tree ownership problem.

Do not create:

```ts
const [filteredItems, setFilteredItems] = useState(...)
```

when `filteredItems` is derived from existing state.

### Effects

Use `useEffect` to synchronize with external systems.

Examples:

- event listeners;
- timers;
- subscriptions;
- native APIs;
- browser APIs;
- imperative third-party widgets.

Do not use effects merely to calculate values that can be calculated during rendering.

React's `useEffect` documentation describes Effects as synchronization with external systems. citeturn537965view3

### Async safety

For asynchronous work:

- handle cancellation/ignore stale results where needed;
- clean up subscriptions;
- prevent state updates after relevant teardown;
- surface user-visible errors.

## TYPESCRIPT RULES

- Keep strict mode enabled.
- Prefer `unknown` over `any` at untrusted boundaries.
- Validate runtime data where correctness requires it.
- Avoid broad `as` casts.
- Name domain types according to business meaning.
- Keep transport DTOs separate from domain models when their shapes differ.
- Avoid duplicated type declarations.

## FEATURE RULES

Feature-specific code stays in the feature.

Example:

```text
features/reader/
├── pages/
├── components/
├── hooks/
├── state/
├── services/
└── types/
```

Do not move code into `shared/` until more than one unrelated feature genuinely needs it.

## PLATFORM RULES

Feature code must not know unnecessary Capacitor implementation details.

Preferred:

```text
feature hook
  ↓
platform/filesystem
  ↓
@capacitor/filesystem
```

For browser/native compatibility:

```text
Application interface
   ├── Capacitor implementation
   └── Web implementation
```

This follows patterns seen in native-bridge examples and real Capacitor applications. citeturn716296view3turn716296view1

## NATIVE LIFECYCLE RULES

When creating a native listener:

1. register it once;
2. retain the listener handle;
3. remove it during teardown;
4. make behavior idempotent.

For app lifecycle/deep-link/restored-result behavior, prefer a central application lifecycle service rather than per-screen listeners unless the event is truly screen-local. Capacitor's App plugin explicitly provides these lifecycle and URL events. citeturn537965view0

## DATA RULES

Never allow components to simultaneously own:

- API fetching;
- persistence;
- transformation;
- error policy;
- UI rendering.

Split these concerns.

## UI RULES

Every meaningful async screen should consider:

```text
loading
success
empty
error
retry
```

Do not hide failures behind blank screens.

## MOBILE RULES

Every new mobile feature must consider:

- safe areas;
- touch targets;
- keyboard;
- scrolling;
- orientation;
- Android back;
- app resume;
- interrupted native operations;
- offline state;
- low-memory behavior;
- small screens;
- accessibility.

## TAILWIND RULES

Use Tailwind v4 conventions.

For Vite:

```css
@import "tailwindcss";
```

and the official Vite plugin.

Use CSS theme variables for reusable design tokens.

Tailwind is mobile-first, so default styles target mobile and breakpoint variants enhance larger layouts. citeturn113719search0

## ENVIRONMENT RULES

Never place secrets in:

```text
VITE_*
```

Vite exposes `VITE_*` variables to client code during bundling. Those values are not secret. citeturn113719search1

Public configuration is acceptable:

- API base URL;
- public project identifiers;
- feature flags intended for clients.

Secrets belong on trusted server infrastructure.

## TEST RULES

New business logic should receive automated tests unless it is trivial.

A useful minimum:

```text
domain/service → unit test
feature component → component test when behavior matters
critical user flow → e2e test
native capability → device/simulator verification
```

Real React/Capacitor projects such as Zaparoo use linting, typechecking, tests and coverage as explicit repository checks. citeturn241410view0

## VERIFICATION RULES

After implementation:

```bash
npm run lint
npm run typecheck
npm run build
```

Use the actual repository scripts if names differ.

For native changes:

```bash
npx cap sync
```

then test the affected native platform.

Never claim:

> "tested on Android"

unless Android was actually run.

## DIFF RULE

Before finishing:

```text
inspect git diff
remove debug code
remove unused imports
check new dependencies
check accidental files
check architecture boundaries
```

## REPORTING

The final implementation report must state:

- what changed;
- which files changed;
- checks actually run;
- native checks actually run;
- known limitations.

Be precise. Never invent verification results.
