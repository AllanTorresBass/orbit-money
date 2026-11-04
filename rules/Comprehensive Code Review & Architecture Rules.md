# Comprehensive Code Review & Architecture Rules

Version: 1.0  
Last Updated: May 2026  
Purpose: Portable standards for code reviews and software architecture. Derived from production mobile app practices and adaptable to React Native, React web, TypeScript backends, and similar stacks.

---

## Table of Contents

1. [How to Use This Guide](https://markdownlivepreview.com/#how-to-use-this-guide)  
2. [Code Review Process](https://markdownlivepreview.com/#code-review-process)  
3. [Priority System](https://markdownlivepreview.com/#priority-system)  
4. [Systematic Review Checklist](https://markdownlivepreview.com/#systematic-review-checklist)  
5. [Architecture Principles](https://markdownlivepreview.com/#architecture-principles)  
6. [Layered Architecture](https://markdownlivepreview.com/#layered-architecture)  
7. [Dependency Injection & Service Access](https://markdownlivepreview.com/#dependency-injection--service-access)  
8. [SOLID Principles](https://markdownlivepreview.com/#solid-principles)  
9. [Code Reusability & Module Boundaries](https://markdownlivepreview.com/#code-reusability--module-boundaries)  
10. [State Management](https://markdownlivepreview.com/#state-management)  
11. [API & Data Layer Rules](https://markdownlivepreview.com/#api--data-layer-rules)  
12. [Component & UI Rules](https://markdownlivepreview.com/#component--ui-rules)  
13. [TypeScript & Type Safety](https://markdownlivepreview.com/#typescript--type-safety)  
14. [Performance & Optimization](https://markdownlivepreview.com/#performance--optimization)  
15. [Security & Production Quality](https://markdownlivepreview.com/#security--production-quality)  
16. [Error Handling & User Feedback](https://markdownlivepreview.com/#error-handling--user-feedback)  
17. [Testing & Documentation](https://markdownlivepreview.com/#testing--documentation)  
18. [Merge Quality Gates](https://markdownlivepreview.com/#merge-quality-gates)  
19. [Code Review Report Template](https://markdownlivepreview.com/#code-review-report-template)  
20. [Quick Reference Commands](https://markdownlivepreview.com/#quick-reference-commands)  
21. [Adapting for Cursor / AI Assistants](https://markdownlivepreview.com/#adapting-for-cursor--ai-assistants)

---

## How to Use This Guide

### Who This Is For

* Reviewers conducting PR reviews with consistent, actionable feedback  
* Authors self-checking before requesting review  
* Tech leads defining team standards for new or existing projects  
* AI assistants (Cursor, Copilot) via .cursorrules or project rules

### How to Adapt to Your Project

Replace placeholder paths and names with your project conventions:

| Concept | Example Placeholder | Your Project |
| ----- | ----- | ----- |
| DI container | serviceContainer | e.g. container, app.get() |
| Service layer | services/modules/ | e.g. src/domain/, lib/services/ |
| Shared UI | components/common/ | e.g. shared/ui/, packages/ui/ |
| Error utility | getErrorMessage() | Your centralized error helper |
| Dev guard | \_\_DEV\_\_ | e.g. process.env.NODE\_ENV \!== 'production' |

Rule of thumb: Keep the *intent* (DIP, DRY, type safety, user feedback). Swap the *implementation details* to match your stack.

---

## Code Review Process

### Pre-Review Preparation

1. Understand context  
   * What problem does this change solve?  
   * Is it a feature, bug fix, refactor, or hotfix?  
   * Are there linked issues, designs, or acceptance criteria?  
2. Define scope  
   * All changed files  
   * Files indirectly affected (imports, shared types, config)  
   * Database migrations, env vars, CI changes  
3. Use tools systematically  
   * Diff view (focus on logic, not just formatting)  
   * Linter and type checker output  
   * Grep/search for anti-patterns (see [Quick Reference Commands](https://markdownlivepreview.com/#quick-reference-commands))  
   * Project rules file (.cursorrules, CONTRIBUTING.md, ADRs)

### Review Execution

1. Run the [Systematic Review Checklist](https://markdownlivepreview.com/#systematic-review-checklist) — do not skip categories  
2. Classify every finding with [Priority System](https://markdownlivepreview.com/#priority-system)  
3. Write specific, actionable feedback (file, line, expected fix)  
4. Re-review after fixes; verify P0 items are resolved

### Review Principles

| Do | Don't |
| ----- | ----- |
| Explain *why* an issue matters | Nitpick style without substance |
| Suggest concrete fixes | Block on preference when a pattern is documented |
| Check related files and patterns | Review only the diff in isolation |
| Use consistent priority labels | Mix severity terminology |

---

## Priority System

All findings must be categorized. P0 issues block merge.

### P0 — Critical / Blocking

Must be fixed before merge.

* Architectural violations (DIP, bypassing DI container, wrong layer dependencies)  
* Security issues (secrets in code, insecure storage, missing auth checks)  
* Production debug code (console logs, unguarded debug output)  
* Missing critical behavior (error handling, user feedback on failures)  
* Type safety violations (any in production paths, missing public API types)  
* Data loss or corruption risks  
* Broken accessibility for legally required flows (where applicable)

### P1 — High

Should be fixed in the same PR or tracked as immediate follow-up.

* DRY violations (duplicated logic across modules)  
* Missing performance patterns in hot paths (memoization, virtualization)  
* Incomplete type definitions (missing interfaces, weak unions)  
* Duplicated UI/component patterns that should be shared  
* Missing loading/error/empty states

### P2 — Medium

Fix when practical.

* Code clarity and naming  
* UX polish  
* Non-critical optimizations  
* Documentation gaps for non-obvious logic

### P3 — Low

Optional improvements.

* Minor cleanup  
* Comment/doc tweaks  
* Style consistency without functional impact

Merge policy: All P0 resolved. P1 resolved or explicitly deferred with a tracked ticket. P2/P3 documented as optional.

---

## Systematic Review Checklist

Use this for every review. Check each section.

### 1\. Service / Domain Layer Audit

*  No debug logging in production-bound code (or guarded by dev-only flag)  
*  Business logic lives in services/domain layer, not in UI  
*  Services depend on interfaces, not concrete implementations  
*  New services registered in DI container (if applicable)  
*  No direct instantiation of services outside the container  
*  No exported singleton instances bypassing the container

Audit command (adjust path):

grep \-r "console\\." src/services/ lib/ api/  
grep \-r "new .\*Service" src/ \--include="\*.ts" \--include="\*.tsx"

### 2\. Duplication & Pattern Audit

*  Similar components/utilities across modules compared for duplication  
*  Shared patterns extracted to common layer with configuration  
*  Module-specific code is thin wrappers, not copy-paste implementations

Audit commands:

\# Find similarly named components  
find . \-name "\*card\*" \-o \-name "\*list\*" \-o \-name "\*table\*" | grep \-v node\_modules

\# Find duplicate function names across modules  
grep \-rh "^export function\\|^export const" src/ | sort | uniq \-d

### 3\. Hooks / Composables / Controllers

*  Side effects cleaned up (subscriptions, listeners, timers)  
*  Data fetching uses established pattern (React Query, SWR, RTK Query, etc.)  
*  Return types and error handling are explicit  
*  No business logic duplicated from services

### 4\. Components / Views

*  Props typed with explicit interfaces  
*  Shared/reusable components memoized where re-render cost matters  
*  Callbacks to memoized children use stable references (useCallback)  
*  Expensive derived data uses memoization (useMemo, computed)  
*  Loading, error, and empty states handled explicitly  
*  Interactive elements meet minimum touch target size (44×44pt mobile)  
*  Accessibility: labels, roles, live regions for dynamic content

### 5\. Architecture & Dependencies

*  Layer boundaries respected (UI → hooks → services → API)  
*  No circular dependencies  
*  Feature modules do not import from sibling feature internals  
*  Shared code lives in shared/common packages or folders

### 6\. Dead Code & Hygiene

*  No unused imports, variables, or unreachable code  
*  No commented-out blocks (unless documented with reason)  
*  TypeScript compiles cleanly (tsc \--noEmit or equivalent)  
*  Linter passes on changed files

---

## Architecture Principles

### Core Goals

1. Maintainability — Easy to change one area without breaking others  
2. Testability — Dependencies injectable; logic testable in isolation  
3. Consistency — Same patterns for same problems across the codebase  
4. Performance — Predictable rendering and data-fetch behavior  
5. Security — Secrets, tokens, and PII handled by design

### Recommended Layer Model

┌─────────────────────────────────────────┐  
│  Presentation (screens, pages, views)   │  
├─────────────────────────────────────────┤  
│  UI Components (presentational)         │  
├─────────────────────────────────────────┤  
│  Hooks / ViewModels / Controllers       │  
├─────────────────────────────────────────┤  
│  Domain / Application Services          │  
├─────────────────────────────────────────┤  
│  Infrastructure (API, storage, network) │  
└─────────────────────────────────────────┘

Dependency direction: Top layers depend on lower abstractions, never the reverse.

| Layer | Responsibility | Must NOT |
| ----- | ----- | ----- |
| Presentation | Routing, layout, composition | Call HTTP clients directly |
| Components | Render UI from props | Fetch data or hold global business state |
| Hooks/Controllers | Orchestrate UI state \+ service calls | Implement HTTP or persistence details |
| Services | Business rules, orchestration | Import UI components |
| Infrastructure | API, DB, file system, platform APIs | Contain product/business rules |

### Folder Structure (Suggested)

Adapt names to your stack:

src/  
├── app/                    \# Routes, screens, pages  
├── components/  
│   ├── common/             \# Shared, configurable components  
│   └── ui/                 \# Design system primitives  
├── hooks/                  \# Data \+ UI orchestration hooks  
├── services/  
│   ├── interfaces/         \# Contracts (IUserService, IApiClient)  
│   ├── modules/            \# Implementations  
│   └── di/                 \# DI container registration  
├── store/                  \# Client state (Zustand, Redux, etc.)  
├── utils/                  \# Pure helpers (dates, errors, formatting)  
├── types/                  \# Shared type definitions  
└── providers/              \# React/context providers, query client

---

## Layered Architecture

### Presentation vs Logic Separation

Correct: Container/presentational split

// Presentational — props in, JSX out  
interface UserCardProps {  
  name: string;  
  onPress: () \=\> void;  
}

export const UserCard \= memo\<UserCardProps\>(({ name, onPress }) \=\> (  
  \<Pressable onPress={onPress} accessibilityRole="button"\>  
    \<Text\>{name}\</Text\>  
  \</Pressable\>  
));

// Hook — data and side effects  
export function useUser(userId: string) {  
  return useQuery({  
    queryKey: \['users', userId\],  
    queryFn: () \=\> container.userService.getById(userId),  
  });  
}

// Screen — composition  
export function UserScreen({ userId }: { userId: string }) {  
  const { data, isLoading, error } \= useUser(userId);  
  if (isLoading) return \<UserSkeleton /\>;  
  if (error) return \<ErrorState message={getErrorMessage(error)} /\>;  
  if (\!data) return \<EmptyState /\>;  
  return \<UserCard name={data.name} onPress={() \=\> navigate('profile')} /\>;  
}

Incorrect: Screen fetches API directly and renders inline logic

// ❌ Mixed concerns  
export function UserScreen({ userId }) {  
  const \[user, setUser\] \= useState(null);  
  useEffect(() \=\> {  
    fetch(\`/api/users/${userId}\`).then(r \=\> r.json()).then(setUser);  
  }, \[userId\]);  
  // ... 200 lines of UI \+ logic  
}

### Feature Module Boundaries

* Features expose a public API (index exports)  
* Internal folders (components/, hooks/, utils/) stay private to the feature  
* Cross-feature imports go through shared/common layers only  
* Avoid "reach into" imports: feature-a/internal/helper from feature-b

---

## Dependency Injection & Service Access

### Rules (Critical)

1. Single access point — All service instances resolved through a DI container or factory  
2. Never new ConcreteService() in UI, hooks, or unrelated modules  
3. Depend on interfaces — Constructors accept IApiService, not AxiosClient  
4. No exported singletons — Do not export const userService \= new UserService()  
5. Lazy initialization — Create services on first access inside the container

### Correct Pattern

// interfaces/IUserService.ts  
export interface IUserService {  
  getById(id: string): Promise\<User\>;  
}

// modules/user-service.ts  
export class UserService implements IUserService {  
  constructor(private api: IApiService) {}  
  async getById(id: string): Promise\<User\> {  
    return this.api.get\<User\>(\`/users/${id}\`);  
  }  
}

// di/container.ts  
class Container {  
  private \_userService: IUserService | null \= null;

  get userService(): IUserService {  
    if (\!this.\_userService) {  
      this.\_userService \= new UserService(this.apiService);  
    }  
    return this.\_userService;  
  }  
}  
export const container \= new Container();

// Usage anywhere  
const user \= await container.userService.getById(id);

### Incorrect Patterns (P0)

// ❌ Direct instantiation in UI/hook  
const service \= new UserService();

// ❌ Exported singleton bypassing container  
export const userService \= new UserService();

// ❌ Import concrete class in consumer  
import { UserService } from './user-service';

### Registering a New Service — Checklist

*  Interface defined in interfaces/  
*  Implementation in modules/ implements interface  
*  Constructor receives dependencies as interfaces  
*  Registered in DI container (property \+ getter \+ lazy init)  
*  Getter validates required dependencies before construction  
*  Consumers use container.serviceName only  
*  No direct export of service instances

---

## SOLID Principles

### Single Responsibility (SRP)

Each class/module has one reason to change.

| Good | Bad |
| ----- | ----- |
| TokenStorage — only persistence | AuthService — login \+ tokens \+ biometrics \+ lockout \+ session |
| UserRepository — data access | UserScreen — fetch \+ validate \+ render \+ navigate |

Action: Split when a file handles unrelated concerns. Prefer composition over god objects.

### Open/Closed (OCP)

Open for extension, closed for modification.

* Extend via interfaces, strategy objects, and configuration  
* Avoid editing stable core classes for every new variant  
* Use plugin/registry patterns for module registration

### Liskov Substitution (LSP)

Implementations must fully satisfy their interface contract.

* All interface methods implemented with compatible behavior  
* Mocks and production implementations interchangeable in tests  
* No "throws NotImplemented" in production paths

### Interface Segregation (ISP)

Prefer several focused interfaces over one large interface.

// ✅ Focused  
interface IReadableStorage { get(key: string): Promise\<string | null\>; }  
interface IWritableStorage { set(key: string, value: string): Promise\<void\>; }

// ❌ Fat interface forcing unused methods  
interface IStorage {  
  get(); set(); delete(); list(); encrypt(); migrate(); /\* ... \*/  
}

### Dependency Inversion (DIP)

High-level modules depend on abstractions, not concretions.

This is the architectural rule most often violated in reviews. Treat DIP violations as P0.

---

## Code Reusability & Module Boundaries

### DRY (Don't Repeat Yourself)

Rule: One implementation per concept. Module-specific code should be configuration, not duplication.

Correct:

// shared/components/MetricsCard.tsx  
export const MetricsCard \= memo\<MetricsCardProps\>(({ items, layout }) \=\> { /\* ... \*/ });

// features/water/WaterMetricsCard.tsx — thin wrapper  
export const WaterMetricsCard \= memo(({ metrics }) \=\> (  
  \<MetricsCard items={buildWaterMetrics(metrics)} layout="grid" /\>  
));

Incorrect:

// ❌ Same layout/logic copied in water/, electric/, hvac/  
export const WaterMetricsCard \= memo(({ metrics }) \=\> { /\* 80 lines \*/ });  
export const ElectricMetricsCard \= memo(({ metrics }) \=\> { /\* 80 lines, nearly identical \*/ });

### Common Duplication Targets

Audit these across modules:

* Date/time formatting and range presets  
* Error message extraction  
* Pagination and list empty states  
* Metric/KPI cards, data tables, filter tabs  
* Chart wrappers and loading shells  
* API response unwrapping/normalization

### Shared Component Pattern

1. Generic component in common/ or design system  
2. Accepts configuration (columns, labels, mappers, icons)  
3. Feature wrappers only map domain data → config  
4. Tests target the generic component once

---

## State Management

### Decision Tree

Is it server/API data?  
├─ Yes → Server-state library (React Query, SWR, RTK Query, Apollo)  
└─ No → Is it shared across many components?  
         ├─ Yes → Does it need persistence?  
         │         ├─ Yes → Global store (Zustand, Redux, Pinia)  
         │         └─ No  → Context or lightweight store  
         └─ No → Local state (useState / useReducer)

### Rules by State Type

| Type | Tool | Use For |
| ----- | ----- | ----- |
| Server state | React Query / equivalent | API data, cache, background sync |
| Persistent client state | Zustand \+ storage / Redux persist | Auth session prefs, theme, selected workspace |
| Context | React Context | DI, theme, auth provider, feature-scoped state |
| Local state | useState | Modals, form inputs, toggles, ephemeral UI |

### Anti-Patterns

* Storing server data in global client store (duplicates cache, stale data)  
* Context for every prop (over-rendering, unnecessary complexity)  
* Lifting state higher than needed  
* Same entity cached in multiple places without single source of truth

### Server-State Conventions

// Hierarchical query keys  
\['projects'\]                          // list  
\['projects', projectId\]               // detail  
\['projects', projectId, 'equipment'\]  // nested resource

// Custom hook per query  
export function useProjects() {  
  return useQuery({  
    queryKey: \['projects'\],  
    queryFn: () \=\> container.projectService.list(),  
    staleTime: 5 \* 60 \* 1000,  
  });  
}

Defaults to document per project: staleTime, gcTime/cacheTime, retry, refetchOnFocus, offline/network mode.

---

## API & Data Layer Rules

### Service Access

* All HTTP/API calls go through a centralized client (interceptors, auth, errors)  
* Never scatter raw fetch / axios in components  
* Retry with exponential backoff for transient failures  
* Token refresh handled in one place, not per call site

### Error Handling

try {  
  return await container.apiService.get\<Data\>('/resource');  
} catch (error: unknown) {  
  const message \= getErrorMessage(error);  
  // Map known codes: SESSION\_EXPIRED, NETWORK\_OFFLINE, VALIDATION\_ERROR  
  throw error; // or return Result type — be consistent project-wide  
}

### Response Handling

* Normalize API shapes at the service boundary  
* Unwrap envelope responses once ({ data: T } → T)  
* Use typed mappers for external schemas (don't leak API shapes into UI)

### Network & Offline (Mobile / PWA)

* Document offline-first vs network-first per query type  
* Certificate pinning or TLS policies in production (mobile)  
* No hardcoded production URLs; use environment config  
* Secrets via CI secret store, never committed

---

## Component & UI Rules

### Memoization (React / Similar)

For shared, list-heavy, or frequently re-rendered components:

| Technique | When |
| ----- | ----- |
| React.memo | Component receives stable-ish props, used in lists or shared UI |
| useCallback | Handlers passed to memoized children |
| useMemo | Expensive transforms, derived objects/arrays passed as props |

export const DataRow \= memo\<DataRowProps\>(({ item, onSelect }) \=\> {  
  const label \= useMemo(() \=\> formatLabel(item), \[item\]);  
  const handlePress \= useCallback(() \=\> onSelect(item.id), \[item.id, onSelect\]);  
  return \<Pressable onPress={handlePress}\>\<Text\>{label}\</Text\>\</Pressable\>;  
});  
DataRow.displayName \= 'DataRow';

Note: Memoize where it matters; don't blanket-memo every leaf without profiling need.

### Loading & Empty States

* Use skeletons matching final layout (not generic "Loading...")  
* Early return for isLoading, error, and empty data  
* Prevent race conditions: don't render stale data while params changed

if (isLoading) return \<TableSkeleton rows={5} /\>;  
if (error) return \<ErrorBanner message={getErrorMessage(error)} /\>;  
if (\!data?.length) return \<EmptyState title="No results" /\>;

### Touch & Accessibility (Mobile / Web)

* Minimum 44×44pt touch targets  
* Use Pressable (RN) or semantic \<button\> (web), not deprecated touch wrappers  
* accessibilityRole, accessibilityLabel, accessibilityLiveRegion for alerts  
* Support dynamic font scaling where platform allows

### Lists & Media

* Virtualize long lists (FlatList, FlashList, virtualized table)  
* Paginate or cursor-fetch large datasets  
* Optimize images (cached, sized, lazy-loaded)  
* Sample/downsample chart data above \~1000 points

---

## TypeScript & Type Safety

### Mandatory Standards

* Explicit interfaces for component props and public service APIs  
* Explicit return types on service methods and exported functions  
* No any in production code — use unknown \+ type guards  
* Union types for constrained values (status: 'active' | 'inactive')  
* Generic types for reusable components (List\<T\>)

### Correct

interface FetchResult\<T\> {  
  data: T;  
  cachedAt: number;  
}

function parseStatus(value: unknown): Status {  
  if (value \=== 'active' || value \=== 'inactive') return value;  
  throw new Error('Invalid status');  
}

catch (error: unknown) {  
  toast.error(getErrorMessage(error));  
}

### Incorrect (P0/P1)

function process(input: any): any { /\* ... \*/ }  
catch (error: any) { alert(error.message); }  
const status: string \= 'active'; // should be Status union

---

## Performance & Optimization

### Checklist

*  Unnecessary re-renders avoided in hot paths  
*  Query cache keys stable and hierarchical  
*  Debounce search/filter inputs  
*  Request deduplication via server-state library  
*  Event listeners / intervals cleaned in useEffect cleanup  
*  React Query (or equivalent) cache eviction documented  
*  Large computations not on render path without memoization

### Memory

* Unsubscribe websockets, NetInfo, keyboard listeners on unmount  
* Clear intervals/timeouts in cleanup  
* Avoid closure leaks holding large objects

---

## Security & Production Quality

### Debug & Logging (P0 if violated)

// ✅ Development only  
if (\_\_DEV\_\_) {  
  console.log('\[ServiceName\]', sanitizedPayload);  
}

// ❌ Production  
console.log('token', accessToken);

* Never log tokens, passwords, PII, or full API keys  
* Use structured logging service in production if needed  
* Remove debug screens/components from production builds

### Security Checklist

*  No secrets in source control  
*  Sensitive data in secure storage (Keychain, EncryptedSharedPreferences, vault)  
*  Auth tokens not in AsyncStorage/plain localStorage when avoidable  
*  Certificate pinning or strict TLS in production (mobile/high-risk)  
*  Input validation at trust boundaries  
*  Authorization checked server-side (client checks are UX only)  
*  Dependencies scanned for known vulnerabilities

### Production Code Quality

*  No TODO blocking release without ticket  
*  No feature flags left enabled by mistake  
*  Environment-specific config validated at startup  
*  Error boundaries around critical UI trees

---

## Error Handling & User Feedback

### Standardized Errors

Rule: One utility normalizes errors for display and logging.

export function getErrorMessage(error: unknown): string {  
  if (error instanceof Error) return error.message;  
  if (typeof error \=== 'string') return error;  
  return 'Something went wrong. Please try again.';  
}

### User Feedback on Async Operations

Rule: User-initiated async actions must give feedback.

| Event | Feedback |
| ----- | ----- |
| Success (mutation) | Toast / inline confirmation |
| Failure | Toast / inline error with actionable message |
| In progress | Loading indicator, disabled button, skeleton |

const handleSave \= async () \=\> {  
  try {  
    await container.settingsService.save(data);  
    toast.success('Settings saved');  
  } catch (error: unknown) {  
    toast.error(getErrorMessage(error));  
  }  
};

P0: Silent failures on user actions (save, delete, submit, pay, login).

### When NOT to Toast

* Background prefetch failures (retry silently, show stale data indicator if needed)  
* Validation errors already inline on form fields  
* Destructive actions without prior confirmation dialog

---

## Testing & Documentation

### Testing Expectations

| Layer | Minimum |
| ----- | ----- |
| Pure utils | Unit tests |
| Services / mappers | Unit tests with mocked I/O |
| Hooks | Integration tests with test query client |
| Critical flows | E2E or integration (auth, checkout, core CRUD) |

* Test error paths, not only happy path  
* Use fixtures/mocks consistent with API contracts

### Documentation

* ADR or README section for non-obvious architectural choices  
* JSDoc on complex public APIs  
* Update docs when changing env vars, API contracts, or migration steps  
* Module README for large features

---

## Merge Quality Gates

All must pass before merge approval.

### Required

*  All P0 issues resolved  
*  TypeScript / compiler clean on CI  
*  Linter clean on changed files  
*  No unguarded debug logging in production paths  
*  No any in changed production code  
*  DI/container pattern followed for new services  
*  Async user actions have success/error feedback  
*  Errors use centralized getErrorMessage (or equivalent)  
*  Systematic checklist completed  
*  No unjustified duplication across modules

### Automatic Blockers

* Direct service instantiation outside DI container  
* Secrets or credentials in code  
* Unguarded console output in production-bound layers  
* Missing error handling on critical user flows  
* Security regressions (auth bypass, insecure storage)

### Pre-Merge Author Checklist

1. Self-review against this document  
2. Run typecheck and lint locally  
3. Test primary flow on device/simulator or staging  
4. Attach screenshots/video for UI changes  
5. Link follow-up tickets for deferred P1 items

---

## Code Review Report Template

\# Code Review Report

\*\*Date:\*\* YYYY-MM-DD    
\*\*Reviewer:\*\* Name    
\*\*PR / Change:\*\* \#123 — short title    
\*\*Scope:\*\* Files / features reviewed  

\#\# Summary

| Priority | Count | Status |  
|----------|-------|--------|  
| P0 Critical | 0 | — |  
| P1 High | 2 | Open |  
| P2 Medium | 1 | Open |  
| P3 Low | 3 | Optional |

\#\# P0 — Critical

\#\#\# 1\. Title  
\- \*\*File:\*\* \`path/to/file.ts:42\`  
\- \*\*Issue:\*\* Description  
\- \*\*Required fix:\*\* Specific action  
\- \*\*Status:\*\* Open / Fixed

\#\# P1 — High

\#\#\# 1\. Title  
...

\#\# Compliance Checklist

\- \[ \] Service/domain layer audit  
\- \[ \] Duplication audit  
\- \[ \] Architecture / DIP  
\- \[ \] TypeScript typing  
\- \[ \] Performance / memoization (if applicable)  
\- \[ \] Security / production logging  
\- \[ \] Error handling & user feedback  
\- \[ \] Merge quality gates

\#\# Recommendation

\*\*Approve / Request changes / Block\*\*

Brief rationale.

---

## Quick Reference Commands

Adjust paths for your repo layout.

\# Debug logging in services  
grep \-rn "console\\." src/services/ lib/

\# Direct service instantiation  
grep \-rn "new .\*Service" src/ \--include="\*.ts" \--include="\*.tsx"

\# Any types  
grep \-rn ": any\\b\\|\<any\>" src/ \--include="\*.ts" \--include="\*.tsx"

\# Typecheck  
npx tsc \--noEmit

\# Similar component filenames  
find src/components \-name "\*card\*" \-o \-name "\*list\*" \-o \-name "\*table\*"

\# TODO/FIXME in changed area  
git diff \--name-only main...HEAD | xargs grep \-n "TODO\\|FIXME" 2\>/dev/null

---

## Adapting for Cursor / AI Assistants

To enforce these rules in Cursor or similar tools, create .cursor/rules/project.mdc (or .cursorrules) with:

1. Priority system — P0 blocks merge; list P0 triggers  
2. Non-negotiables — DI container only, no any, guarded logging, user feedback on async  
3. Project paths — Your actual folders for services, components, utils  
4. Patterns — Link or embed 2–3 canonical examples from your codebase  
5. Review checklist — Short version of [Systematic Review Checklist](https://markdownlivepreview.com/#systematic-review-checklist)

### Minimal Cursor Rules Snippet (Customize)

\#\# Code Review Priorities  
\- P0: DIP violations, security, unguarded console.\*, missing error UX, any types  
\- P1: DRY violations, missing types, hot-path performance

\#\# Architecture  
\- Access services only via \`container.\*\` in \`src/services/di/\`  
\- UI → hooks → services → api; never fetch in components  
\- Extract duplicate \*-card, \*-list, \*-table patterns to \`components/common/\`

\#\# TypeScript  
\- Explicit props interfaces; no \`any\`; use unknown \+ getErrorMessage()

\#\# Before merge  
\- P0 fixed; tsc clean; checklist in docs/COMPREHENSIVE\_CODE\_REVIEW\_AND\_ARCHITECTURE\_RULES.md

---

## Version History

| Version | Date | Notes |
| ----- | ----- | ----- |
| 1.0 | May 2026 | Initial portable guide synthesized from project cursor rules, code review requirements, and architecture docs |

---

Maintained by: Development team  
Review cadence: Update after major architectural decisions or post-mortems from production incidents

