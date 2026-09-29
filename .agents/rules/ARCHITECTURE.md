# ARCHITECTURE.md
# React 19 + TypeScript + Vite + Tailwind CSS v4 + Capacitor 8

## 1. Purpose

This document defines the **application architecture**, not merely a folder structure.

It is designed for a production mobile application built with:

- React 19
- TypeScript
- Vite
- Tailwind CSS v4
- Capacitor 8

The rules below are based on:

1. official React / Vite / Tailwind / Capacitor guidance;
2. current open-source React + Capacitor applications;
3. real repository patterns around offline storage, native integration, testing, release workflows, localization, multi-target builds, and mobile lifecycle.

The architecture is intentionally **pragmatic**. Do not introduce layers or abstractions merely because this file contains them.

---

# 2. The architecture in one picture

```text
                           APPLICATION
                                │
                    ┌───────────┴───────────┐
                    │          app/         │
                    │ shell / routing /     │
                    │ providers / lifecycle │
                    └───────────┬───────────┘
                                │
                         ┌──────┴──────┐
                         │  features/  │
                         │ user flows  │
                         └──────┬──────┘
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
             ▼                  ▼                  ▼
          domain/            infra/            platform/
       business rules      external data       device/runtime
             │                  │                  │
             │                  │                  │
             └──────────────┬───┴──────────────────┘
                            │
                         shared/
                  generic reusable primitives
```

Native projects remain outside `src/`:

```text
android/
ios/
```

The web application remains the primary UI/runtime:

```text
React → Vite → web assets → Capacitor → Android/iOS
```

---

# 3. The most important architectural decision

The application is **feature-first inside a layered boundary system**.

That means:

- `features/` organizes the product around what users actually do;
- `domain/` owns pure business meaning;
- `infra/` owns external data mechanisms;
- `platform/` owns device/runtime mechanisms;
- `app/` owns application composition;
- `shared/` owns genuinely reusable primitives.

Do not choose between "feature-based architecture" and "layered architecture".

Use both:

```text
vertical organization
        +
horizontal dependency boundaries
```

This is the main lesson from the repositories reviewed.

---

# 4. What the open-source projects taught us

## 4.1 IGNF EspaceCo Mobile — strongest architectural reference

Repository:

https://github.com/IGNF/espaceco-mobile-refonte

This is a particularly relevant reference because it is itself a current React 19 + TypeScript + Vite + Capacitor 8 mobile application.

Its source is explicitly divided into:

```text
app/
domain/
infra/
platform/
features/
shared/
```

and its repository describes separate responsibilities for these layers.

### What we adopt

**Adopt:**

- pure `domain/`;
- concrete `infra/`;
- explicit `platform/`;
- vertical `features/`;
- generic `shared/`;
- global providers in `app/`;
- explicit offline infrastructure;
- repositories and synchronization;
- platform wrappers;
- strict TypeScript;
- centralized i18n;
- feature-local pages/components/hooks/state.

### Important lesson

Do not allow this:

```text
feature
  ├── API call
  ├── database write
  ├── Capacitor call
  ├── business rule
  └── JSX
```

Prefer:

```text
feature
   ↓
domain/use case
   ↓
repository/platform contract
   ↓
infra/platform implementation
```

### Another lesson

EspaceCo has application-level providers for cross-feature concerns such as:

- authentication;
- settings;
- active community/context;
- offline state;
- localization.

This shows that not all shared state should be pushed into a generic global store.

A **small number of explicit application providers** can be clearer than one giant global state container.

### Another important lesson

It supports multiple application variants with its `selectapp` scripts.

Therefore:

> Product variants should be represented through configuration/capability profiles where possible, not by forking the React application.

Do not create:

```text
src-app-a/
src-app-b/
```

unless the products are genuinely different applications.

---

# 5. Zaparoo App — build profiles, optional capabilities, and release discipline

Repository:

https://github.com/ZaparooProject/zaparoo-app

Zaparoo is a React/TypeScript application deployed through Capacitor and also used as a web interface.

Its repository exposes distinct build modes such as:

```text
web build
mobile build/sync
core/embedded build
```

and explicit:

```text
test
coverage
lint
typecheck
build
sync
```

scripts.

## What we adopt

### 5.1 One application can have multiple runtime targets

Architecture must tolerate:

```text
Web
Mobile
Embedded/alternate runtime
```

without duplicating feature implementations.

Use:

```text
capability flags
runtime adapters
build profiles
```

rather than cloning the application.

### 5.2 Optional native dependencies must fail safely

Zaparoo documents optional native capability where the app can run without a licensed NFC plugin and disables the related feature when the plugin is absent.

This gives us a rule:

> A nonessential native plugin must not make the entire application unusable when unavailable.

Prefer:

```text
plugin available
    → feature enabled

plugin unavailable
    → capability reports unsupported
    → application continues
```

Avoid:

```text
plugin unavailable
    → application startup crash
```

### 5.3 Build and sync are different operations

A web build and native synchronization are not conceptually the same thing.

Use explicit pipeline steps:

```text
typecheck
→ lint
→ tests
→ web build
→ cap sync
→ native build
```

### 5.4 Translation is architecture, not decoration

Zaparoo explicitly calls out translation updates when application text changes.

Therefore:

> Every user-visible product string must be owned by the localization system.

Do not scatter permanent user-visible strings inside infrastructure code.

---

# 6. Capstart — web-first mobile architecture

Repository:

https://github.com/AdrienADV/capstart

Capstart combines:

- React 19;
- Vite;
- TypeScript;
- Capacitor 8;
- Tailwind CSS v4;
- mobile-first layout;
- safe-area handling;
- authentication;
- protected routes.

## What we adopt

### 6.1 Keep the product UI in React

Capacitor should provide capabilities, not become a second UI framework.

Use native UI only when there is a strong platform reason.

Default:

```text
React UI
```

Optional:

```text
native UI surface
```

Do not create native screens just because the app is mobile.

### 6.2 Safe areas belong to the design system

Safe-area handling should be predictable and reusable.

Do not repeat random:

```css
padding-top: 47px;
```

through individual screens.

Use application-level primitives/tokens.

### 6.3 Minimal versus recommended native setup

Capstart distinguishes a minimal setup from a recommended set of plugins.

This leads to:

> Do not install every Capacitor plugin at project creation.

Add plugins based on actual capability requirements.

---

# 7. Ionic Photo Gallery — simple feature does not require over-architecture

Repository:

https://github.com/ionic-team/tutorial-photo-gallery-react

The React photo-gallery tutorial places Camera, Filesystem and Preferences logic behind:

```text
usePhotoGallery()
```

while the screen remains focused on UI.

## What we adopt

For a **small feature**, this is acceptable:

```text
feature component
      ↓
feature hook
      ↓
Capacitor abstraction
```

You do NOT have to create:

```text
domain use case
repository interface
repository implementation
platform service
adapter
factory
```

for a feature that is genuinely tiny.

## Important architecture rule

Use the **smallest abstraction stack that creates a real boundary**.

### Small feature

```text
UI
 ↓
feature hook/service
 ↓
platform API
```

### Medium feature

```text
UI
 ↓
feature hook
 ↓
service
 ↓
platform adapter
```

### Complex data feature

```text
UI
 ↓
feature hook
 ↓
use case
 ↓
repository interface
 ↓
infra repository
 ↓
API / SQLite / cache
```

This prevents architecture from becoming ceremony.

---

# 8. Baggle — persistence ownership and reactive updates

Repository:

https://github.com/xanndevs/baggle

Baggle is an offline-first Ionic React + Capacitor application.

It uses a **single shared storage instance** and exposes a lightweight subscription mechanism so React components can react when persisted data changes.

## What we adopt

### 8.1 One persistence owner

Do not do:

```text
Component A → creates storage
Component B → creates storage
Component C → creates storage
```

when the persistence mechanism is intended to be shared.

Prefer:

```text
single persistence service
        ↓
repository/storage API
        ↓
subscribers
```

### 8.2 Persistence changes need a reactive path

If external persistence changes can invalidate UI state:

```text
storage change
     ↓
notification/subscription
     ↓
feature state update
     ↓
React render
```

Do not force every component to poll storage.

### 8.3 Cleanup is mandatory

Every subscription must have a corresponding cleanup path.

---

# 9. Capacitor SQLite demo — database architecture is a real subsystem

Repository:

https://github.com/capawesome-team/capacitor-sqlite-react-demo

Capacitor SQLite documentation:

https://github.com/capawesome-team/capacitor-plugins/tree/main/packages/sqlite

The reviewed example demonstrates:

- schema upgrade statements;
- typed/parameterized queries;
- transactions;
- commit/rollback;
- database connection lifecycle;
- web support.

## What we adopt

SQLite is not "just another utility."

Once the application has structured local data, treat the database as an infrastructure subsystem:

```text
features
   ↓
repository interface
   ↓
infra database repository
   ↓
SQLite adapter
```

### Required

- versioned schema;
- migrations;
- transaction boundaries;
- parameterized queries;
- explicit connection lifecycle;
- tested failure paths.

### Do not

- create tables ad hoc from random components;
- embed SQL throughout JSX;
- duplicate database initialization;
- store a large relational dataset as one JSON preference;
- silently modify schema without a migration.

---

# 10. Tutorial and generated native files — never fight Capacitor's generation model

Capacitor repositories include generated native files.

For example, the Ionic Capacitor tutorial contains generated Gradle configuration explicitly marked:

```text
DO NOT EDIT THIS FILE!
```

because it is regenerated by Capacitor tooling.

## Rule

Before changing anything under:

```text
android/
ios/
```

ask:

```text
Is this generated?
Is this source-controlled?
Does this belong in capacitor.config.ts?
Does this belong in a plugin?
Does this belong in native code?
```

Prefer changing the source of generation rather than patching generated output.

---

# 11. Final architecture

## Root

```text
project/
├── android/
├── ios/
├── public/
├── src/
├── tests/
├── docs/
├── scripts/
├── capacitor.config.ts
├── vite.config.ts
├── eslint.config.js
├── package.json
└── tsconfig*.json
```

---

# 12. `src/app/` — application composition

```text
src/app/
├── App.tsx
├── main.tsx
├── providers/
├── routes/
├── guards/
├── lifecycle/
└── config/
```

Own:

- root composition;
- global providers;
- routing;
- auth restoration;
- localization initialization;
- application lifecycle;
- global error boundary;
- runtime configuration.

Do not put business features here.

## Healthy `App.tsx`

Conceptually:

```text
Error Boundary
   ↓
Localization
   ↓
Authentication
   ↓
Settings
   ↓
Connectivity/Offline
   ↓
Runtime/Capability context
   ↓
Router
```

Keep it compositional.

---

# 13. `src/domain/` — business meaning

```text
src/domain/
├── entities/
├── value-objects/
├── validators/
├── errors/
└── use-cases/
```

Domain code may contain:

- business rules;
- entity models;
- value objects;
- validation;
- pure calculations;
- pure transformations;
- domain errors;
- use cases that are independent of infrastructure.

## Hard dependency rule

Domain must NOT depend on:

```text
React
Capacitor
browser DOM
HTTP clients
SQLite
IndexedDB
OpenLayers
filesystem
native plugins
```

Ideally:

```text
domain → no infrastructure
domain → no platform
domain → no UI
```

A domain module should be executable in a plain Node test without booting the application.

---

# 14. `src/infra/` — external data and persistence

```text
src/infra/
├── api/
├── auth/
├── repositories/
├── persistence/
├── database/
├── cache/
├── sync/
├── serialization/
└── telemetry/
```

Own:

- HTTP;
- API DTOs;
- API mappers;
- auth transport;
- database adapters;
- storage;
- repository implementations;
- offline queues;
- synchronization;
- caching;
- telemetry providers.

## Rule

`infra/` knows about outside systems.

`domain/` does not.

---

# 15. `src/platform/` — device and runtime boundary

```text
src/platform/
├── capacitor/
│   ├── app/
│   ├── camera/
│   ├── filesystem/
│   ├── keyboard/
│   ├── notifications/
│   ├── network/
│   ├── haptics/
│   ├── device/
│   └── share/
└── web/
    ├── filesystem/
    ├── notifications/
    └── ...
```

Own:

- Capacitor;
- browser APIs when used as platform replacements;
- native lifecycle;
- device capabilities;
- system integration.

## Stable boundary

Prefer:

```ts
export interface AppFilesystem {
  save(...): Promise<...>;
  read(...): Promise<...>;
  remove(...): Promise<...>;
}
```

instead of:

```ts
import { Filesystem } from '@capacitor/filesystem';
```

in arbitrary features.

## Exception

A very small feature may use a feature hook that directly encapsulates one Capacitor API, as demonstrated by Ionic's Photo Gallery tutorial.

Once the capability is reused or becomes business-critical, move it behind a platform boundary.

---

# 16. `src/features/` — vertical user workflows

```text
src/features/
├── auth/
├── onboarding/
├── home/
├── reader/
├── library/
├── downloads/
├── settings/
└── ...
```

Typical feature:

```text
feature/
├── pages/
├── components/
├── hooks/
├── state/
├── services/
├── types/
├── utils/
└── index.ts
```

Do not create every directory automatically.

## Feature ownership

A feature owns:

- its screens;
- feature-specific components;
- feature-specific hooks;
- workflow state;
- orchestration;
- UI behavior.

It does not own:

- global routing;
- native plugin implementation;
- database drivers;
- generic buttons;
- generic date utilities.

---

# 17. `src/shared/` — reusable primitives, not application logic

```text
src/shared/
├── components/
├── hooks/
├── lib/
├── types/
├── utils/
├── constants/
└── i18n/
```

Good:

```text
Button
Dialog
useDebounce
formatBytes
formatDate
```

Bad:

```text
ReaderHeader
LibraryDownloadManager
InvoiceSyncService
```

if only one feature uses them.

## Promotion rule

Do not move something to `shared/` because:

> "It might be reusable later."

Move it when:

> "At least two unrelated features need the same semantics."

---

# 18. Dependency rules

Preferred:

```text
app
 ├── features
 ├── domain
 ├── infra
 ├── platform
 └── shared

features
 ├── domain
 ├── infra
 ├── platform
 └── shared

infra
 ├── domain
 └── shared

platform
 └── shared

domain
 └── domain-internal code

shared
 └── shared-internal code
```

## Forbidden

```text
domain → feature
domain → platform

shared → feature
shared → infra

feature A → feature B private implementation

UI → raw database driver

UI → raw Capacitor plugin everywhere
```

## Feature-to-feature communication

Do not import:

```text
features/orders/internalThing
```

from:

```text
features/cart
```

Prefer:

```text
shared contract
domain entity/use-case
application event
repository/service
```

depending on the requirement.

---

# 19. Data flow patterns

## Pattern A — local UI behavior

```text
Component
   ↓
useState/useReducer
   ↓
render
```

## Pattern B — native capability

```text
Component
   ↓
Feature Hook
   ↓
Platform Adapter
   ↓
Capacitor
   ↓
Native
```

## Pattern C — server data

```text
Component
   ↓
Feature Hook
   ↓
Feature Service
   ↓
Repository
   ↓
API Client
   ↓
Server
```

## Pattern D — offline data

```text
Component
   ↓
Feature Hook
   ↓
Use Case
   ↓
Repository
   ↓
Local DB / Cache
   ↓
Sync Engine
   ↓
Remote API
```

## Pattern E — file-based feature

```text
Feature
   ↓
Repository
   ├── metadata → database
   └── binary   → filesystem
```

Do not put large binaries inside ordinary key/value preferences.

---

# 20. State ownership

Use the smallest useful scope.

```text
component state
     ↓
feature state
     ↓
application state
```

Do not make everything global.

## Application providers are acceptable

Explicit providers for:

- authentication;
- settings;
- localization;
- offline state;
- current user context;
- current workspace/community.

are acceptable when they genuinely represent application-wide state.

The EspaceCo repository demonstrates this pattern.

## Avoid giant provider objects

Do not create:

```text
GlobalContext
```

containing:

- auth;
- settings;
- books;
- reader;
- downloads;
- notifications;
- theme;
- analytics;
- network;
- everything else.

Prefer separate ownership.

---

# 21. Persistence and reactivity

Use one authoritative persistence service/repository per data concern.

```text
Repository
   ↓
Persistence
   ↓
subscription/change event
   ↓
feature state
```

A component should not directly coordinate three storage systems.

---

# 22. Offline-first architecture

Offline is a product architecture, not a boolean.

A real offline feature should define:

```text
local source of truth
        ↓
pending mutations
        ↓
sync engine
        ↓
remote server
        ↓
conflict resolution
```

## Required decisions

Before declaring a feature offline-capable, define:

- what works offline;
- what data is cached;
- which mutations are queueable;
- retry policy;
- conflict policy;
- synchronization triggers;
- user-visible sync state;
- deletion behavior.

EspaceCo demonstrates explicit offline infrastructure for caches, downloadable map data and synchronization. That is a much stronger pattern than sprinkling `localStorage` calls throughout screens.

---

# 23. Runtime profiles and variants

The same application may run as:

```text
Web
Android
iOS
Embedded web runtime
```

or have multiple branded/product variants.

Use:

```text
runtime capabilities
build-time configuration
feature flags
environment configuration
platform adapters
```

Do not fork the feature tree unless the products genuinely diverge.

Example:

```text
features/
   reader/
```

remains shared while:

```text
platform/
   capacitor/
   web/
```

handles runtime differences.

---

# 24. Capability-based native design

Do not scatter:

```ts
if (Capacitor.getPlatform() === 'android')
```

through components.

Prefer capability questions:

```ts
filesystem.isSupported()
camera.isSupported()
share.isSupported()
```

The UI should care about:

```text
capability available
```

not:

```text
which platform string is active
```

This also makes embedded/web targets easier to support.

---

# 25. Optional native plugin rule

If a plugin is optional:

```text
Plugin exists
    ↓
capability enabled
```

If unavailable:

```text
capability unavailable
    ↓
feature degrades gracefully
```

Do not make application startup fail just because an optional native plugin is missing.

---

# 26. Navigation architecture

Navigation is application infrastructure.

```text
app/routes/
```

owns:

- route definitions;
- auth guards;
- route-level error boundaries;
- deep-link mapping;
- route transitions.

Feature owns:

```text
features/<feature>/pages/
```

## Prefer identifiers in URLs

Use:

```text
/reader/:bookId
```

instead of passing an entire object through navigation.

Navigation state should remain serializable and recoverable.

---

# 27. Deep-link flow

Treat native URL events as external input:

```text
Capacitor appUrlOpen
       ↓
parse
       ↓
validate
       ↓
authentication check
       ↓
map to route
       ↓
router
```

Support:

- cold start;
- warm app;
- background resume;
- unauthenticated state.

Capacitor's App API exposes both launch URL retrieval and `appUrlOpen`.

---

# 28. Native lifecycle

Lifecycle belongs in:

```text
platform/
app/lifecycle/
```

not inside random screens.

Centralize:

- `appStateChange`;
- `pause`;
- `resume`;
- `appUrlOpen`;
- `appRestoredResult`;
- Android back button.

## Why

Mobile processes can be killed while a native flow is in progress.

The app therefore cannot assume:

```text
start native operation
↓
same JS process always returns normally
```

Persist recoverable workflow state when necessary.

---

# 29. Android back-button rule

Define the hierarchy:

```text
modal
 ↓
nested feature navigation
 ↓
root navigation
 ↓
system/default behavior
```

Do not make every screen decide whether the app should exit.

---

# 30. Database rules

For structured local data:

```text
feature
 ↓
repository interface
 ↓
SQLite repository
 ↓
SQLite adapter
```

Required:

- schema version;
- migrations;
- parameterized statements;
- transactions;
- explicit error handling;
- tested initialization;
- connection lifecycle.

The reviewed Capawesome SQLite project specifically demonstrates upgrade statements, parameterized/typed queries, transactions and connection lifecycle.

---

# 31. API architecture

API boundaries must distinguish:

```text
transport shape
```

from:

```text
application meaning
```

Prefer:

```text
HTTP JSON
   ↓
DTO
   ↓
mapper
   ↓
domain model
```

Do not let backend naming leak everywhere simply because it is convenient.

---

# 32. Error architecture

Errors should be classified.

Example:

```text
validation error
auth error
network error
server error
storage error
platform unsupported
native permission denied
conflict
unexpected error
```

Then map them to:

```text
domain error
feature error state
user-facing message
telemetry
```

Do not show raw stack traces or raw API error bodies to users.

---

# 33. Loading/empty/error architecture

Every meaningful asynchronous screen should define:

```text
Loading
Success
Empty
Error
Retry
```

For mutations:

```text
Idle
Submitting
Success
Recoverable failure
Permanent failure
```

For native operations additionally consider:

```text
permission denied
unsupported
cancelled
interrupted
restored
```

---

# 34. Localization

User-visible text belongs to the localization system.

Do not place permanent UI strings inside:

```text
domain
infra
platform
generic utilities
```

Instead:

```text
error code
   ↓
feature/application mapping
   ↓
translation key
   ↓
localized message
```

Open-source applications reviewed use locale files and explicitly consider translations part of contribution changes.

---

# 35. Generated native code

Treat these directories as native projects:

```text
android/
ios/
```

Before editing a native file:

1. inspect whether it is generated;
2. check whether Capacitor recreates it;
3. determine the real source of configuration;
4. edit the source of generation when possible.

Never blindly patch:

```text
capacitor.build.gradle
```

or another generated artifact.

---

# 36. Testing architecture

Use different tests for different boundaries.

```text
domain
  → unit tests

feature
  → component/integration tests

repository
  → data-layer tests

critical workflows
  → e2e

native capability
  → simulator/device tests
```

## Domain tests

Must not require:

- React;
- Capacitor;
- browser DOM;
- network;
- real database.

## Native tests

A browser test cannot prove:

- camera works;
- filesystem permission works;
- Android back works;
- deep links work;
- push notifications work;
- lifecycle restoration works.

Those need native verification.

---

# 37. Build and release architecture

Recommended pipeline:

```text
install
 ↓
typecheck
 ↓
lint
 ↓
unit/component tests
 ↓
web build
 ↓
Capacitor sync
 ↓
native build
 ↓
native verification
 ↓
release
```

Keep distinct commands for:

```text
web-only build
mobile build
native sync
native open/run
release
```

Zaparoo and other reviewed projects make these steps explicit rather than hiding every action in one opaque command.

---

# 38. Dependency architecture

Avoid parallel ecosystems.

Do not introduce:

```text
Redux + Zustand
Axios + fetch + another client
two routers
two UI libraries
two i18n libraries
two storage systems
```

without a documented architectural reason.

The goal is:

```text
one concept
one owner
one primary mechanism
```

---

# 39. What NOT to copy blindly from open source

Open-source projects are evidence, not commandments.

Do NOT blindly copy:

### Ionic UI

An Ionic application may use Ionic navigation/components that our plain React + Tailwind application does not need.

### Supabase

Capstart uses Supabase auth, but this does not mean every application should use Supabase.

### SQLite everywhere

SQLite is excellent for structured offline data, but preferences do not need a relational database.

### Giant domain layers

Some applications genuinely need domain/use-case layers. Tiny UI-only features may not.

### Community plugins

A plugin being used by a popular repository does not automatically make it appropriate for this application.

### Existing repository quirks

Open-source code may contain:

- migration artifacts;
- compatibility code;
- historical workarounds;
- project-specific conventions.

Copy the **principle**, not the accidental implementation.

---

# 40. Architecture maturity levels

## Level 1 — simple feature

```text
Feature
 ↓
React state/hook
 ↓
platform adapter
```

Use when the feature is small and local.

## Level 2 — reusable service

```text
Feature
 ↓
service
 ↓
platform/infra adapter
```

Use when behavior is reused inside the feature or across a few features.

## Level 3 — data feature

```text
Feature
 ↓
use case/service
 ↓
repository
 ↓
infra
```

Use when data ownership, testing or persistence requires a boundary.

## Level 4 — offline/complex domain

```text
Feature
 ↓
domain use case
 ↓
repository contract
 ↓
local persistence
 ↓
sync
 ↓
remote API
```

Use for:

- complex offline workflows;
- conflict handling;
- structured local data;
- multi-step business operations.

Do not start at Level 4 without a real reason.

---

# 41. Final dependency rules

## Allowed

```text
app → features
app → domain
app → infra
app → platform
app → shared

features → domain
features → infra
features → platform
features → shared

infra → domain

platform → shared

domain → internal domain modules

shared → internal shared modules
```

## Forbidden

```text
domain → React
domain → Capacitor
domain → database
domain → HTTP

shared → feature

feature A → feature B private implementation

component → database driver

component → raw native plugin throughout application
```

---

# 42. Final decision framework

When an agent is deciding where code belongs, ask these questions in order:

### Question 1
Is this pure business meaning?

```text
→ domain
```

### Question 2
Does this communicate with an external data source?

```text
→ infra
```

### Question 3
Does this communicate with the device/runtime?

```text
→ platform
```

### Question 4
Does this implement a user workflow?

```text
→ feature
```

### Question 5
Is it generic and reused by unrelated features?

```text
→ shared
```

### Question 6
Does it configure/combine the whole application?

```text
→ app
```

If two answers appear equally valid, choose the layer that owns the **responsibility**, not the layer that currently happens to call the code.

---

# 43. Architectural principles distilled from the open-source experience

The practical lessons are:

```text
1. Features organize the product.
2. Domain protects business rules.
3. Infra protects data sources.
4. Platform protects native/runtime details.
5. App owns composition.
6. Shared remains small and generic.
7. Persistence has one owner.
8. Offline behavior is explicit.
9. Native capabilities degrade gracefully when optional.
10. Build targets are profiles, not forks.
11. Generated native files are not hand-edited blindly.
12. Localization is part of architecture.
13. Mobile lifecycle is a first-class concern.
14. Native testing is required for native behavior.
15. Small features should not be over-engineered.
16. Every abstraction must earn its complexity.
17. One concept should have one authoritative owner.
18. Copy principles from open source, not project-specific accidents.
```

---

# 44. Primary research references

## Official

React:
https://react.dev/learn/thinking-in-react
https://react.dev/learn/managing-state
https://react.dev/learn/choosing-the-state-structure
https://react.dev/reference/react/useEffect

Vite:
https://vite.dev/guide/env-and-mode

Tailwind:
https://tailwindcss.com/docs/installation/using-vite
https://tailwindcss.com/docs/responsive-design
https://tailwindcss.com/docs/theme

Capacitor:
https://capacitorjs.com/docs
https://capacitorjs.com/docs/apis/app
https://capacitorjs.com/docs/apis/keyboard
https://capacitorjs.com/docs/guides/deep-links

## Open-source projects reviewed

### IGNF EspaceCo Mobile
https://github.com/IGNF/espaceco-mobile-refonte

Main lessons:
- explicit `app/domain/infra/platform/features/shared`;
- offline infrastructure;
- repositories;
- synchronization;
- provider-based application state;
- variant configuration;
- platform wrappers.

### Zaparoo App
https://github.com/ZaparooProject/zaparoo-app

Main lessons:
- web/mobile/embedded build targets;
- explicit build/test/typecheck/lint workflow;
- localization discipline;
- optional native capabilities.

### Capstart
https://github.com/AdrienADV/capstart

Main lessons:
- React 19 + Vite + TypeScript + Capacitor 8;
- Tailwind v4;
- web-first product UI;
- safe areas;
- protected routes;
- minimal vs recommended native plugin setup.

### Ionic Photo Gallery — React
https://github.com/ionic-team/tutorial-photo-gallery-react

Main lessons:
- feature hook encapsulation for native APIs;
- filesystem + preferences separation;
- simple features do not need excessive layers.

### Capawesome Capacitor SQLite React Demo
https://github.com/capawesome-team/capacitor-sqlite-react-demo

Main lessons:
- migrations;
- transactions;
- typed/parameterized queries;
- database lifecycle;
- explicit native synchronization.

### Baggle
https://github.com/xanndevs/baggle

Main lessons:
- one shared persistence layer;
- reactive storage updates;
- offline-first application model;
- localization.

### Capacitor SQLite Plugin
https://github.com/capawesome-team/capacitor-plugins/tree/main/packages/sqlite

Main lessons:
- schema migrations;
- transaction semantics;
- encryption support;
- structured local storage use cases.

---

# 45. Final rule for agents

Do not ask:

> "Which folder does this code go into?"

Ask:

> "Which layer owns this responsibility, and what is the smallest boundary that prevents that responsibility from leaking?"

That question is the architectural standard for this application.
