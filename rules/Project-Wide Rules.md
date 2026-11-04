

## ---

**\#\# 1\. Strict TypeScript Requirements**

TypeScript is not optional; it is the project's primary defense against runtime errors.

* **MANDATORY Prop Interfaces:** Every React component **must** have an explicit interface for its props.  
* **Zero any Tolerance:** The use of any is a P0 critical violation. Use unknown with type guards if a type is truly dynamic.  
* **Centralized Types:** All interfaces and Zod schemas must reside in the /types/ directory, organized by feature (e.g., /types/client/client.types.ts).  
* **Explicit Service Typing:** Every service method must define its parameter and return types explicitly.

## ---

**\#\# 2\. Code Reusability (DRY Principle)**

To prevent "spaghetti code," logic must be abstracted and decoupled from specific modules.

* **Generic Components:** Shared UI like tables, dialogs, and forms must be generic (e.g., DataTable\<T\>) and located in components/shared/.  
* **Module Decoupling:** Components should never hardcode module-specific text or logic. Use configuration objects or props to make them module-agnostic.  
* **Utility Extraction:** Common logic (date formatting, error message parsing) must be moved to lib/utils/ before it is duplicated.

## ---

**\#\# 3\. Reliability & Feedback**

A professional user experience requires consistent logging and feedback loops.

* **Centralized Logger:** Never use console.log. Use the custom logger utility from @/lib/logger, which handles environment-specific behavior.  
* **Mandatory User Feedback:** Every asynchronous operation (Create, Update, Delete) **must** trigger a success or error notification via the useGlobalErrorHandler hook.  
* **Error Handling:** All error catching must pass through handleCrudError or handleFetchError to ensure consistent toast notifications.

## ---

**\#\# 4\. Quality Gates & Reviews**

Before code is merged, it must pass through a systematic audit:

| Priority | Issue Type | Requirement |
| :---- | :---- | :---- |
| **P0 (Critical)** | Architectural / Security | No direct service instantiation; no any types; no console.log. |
| **P1 (High)** | DRY / Type Safety | Address code duplication and missing union types. |
| **P2 (Medium)** | UX / Optimization | Improvements to performance or documentation. |

## ---

**\#\# 5\. Responsive Standards**

The project follows a **Mobile-First** approach using Tailwind CSS.

* **Width 360px:** All views must be fully functional at 360px without horizontal scrolling.  
* **Breakpoints:** Use standard Tailwind breakpoints (sm, md, lg) for all grid and typography adjustments.

Would you like a template for a **Service Layer Audit** or a **Component Pattern Audit** to perform your first code review?