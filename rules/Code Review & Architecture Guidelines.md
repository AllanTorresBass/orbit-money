# **Code Review & Architecture Guidelines**

---

**Version:** 1.1  
**Last Updated:** May 2026  
**Purpose:** Centralized, actionable engineering standards for code reviews, self-checks, and AI assistant configurations (Cursor/Copilot) built on strict SOLID principles.

## **1\. Priority System & Merge Quality Gates**

All software engineering findings must be categorized accurately using the following priority matrix. P0 issues strictly block merging into main production branches.

### **P0 — Critical (Merge Blockers)**

* **Production Debug Code:** Any unguarded console expressions (console.log, console.warn, console.error, console.info).  
* **Type Safety Violations:** Explicit or implicit usage of the 'any' keyword, or unsafe 'as any' type assertions.  
* **Architectural Boundary Crossings:** Direct instantiation of service classes bypassing the centralized Dependency Injection (DI) container, or screen layers interacting with raw network fetch interfaces.  
* **Silent Failures:** Missing error isolation or failure to provide visual notifications (toasts, structural layouts) to users during asynchronous workflows.  
* **Security Vulnerabilities:** Storing production secrets or environment credentials in plaintext repository code, SQL injection opportunities, or unguarded JSON.parse statements.

### **P1 — High Priority (Address Pre-Merge)**

* **DRY Violations:** Duplicated logical algorithms or cloned user interface structures across independent functional modules.  
* **Incomplete Type Centralization:** Defining localized interfaces inside functional components or custom hooks rather than leveraging a unified directory.  
* **Missing Layout States:** Omitting distinct handling paths for ongoing loading processes (skeletons), visible error banners, or empty resource views.

### **P2 — Medium & P3 — Low Priority**

* **Clarity and UX:** Contextual naming adjustments, subtle layout refinement, non-blocking documentation expansion, or stylistic polish.

## **2\. Pre-Merge Automated Verification Commands**

Run these structural evaluation scripts locally within your repository before publishing any Pull Request:

`# 1. Search for leaky console log statements (ignoring node_modules and Next.js builds)`  
`grep -r "console\." --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v ".next"`

`# 2. Identify explicit any types or escape-hatch assertions`  
`grep -r ":\s*any\b\|as any" --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v ".next"`

`# 3. Locate local type or interface declarations outside the centralized boundaries`  
`grep -r "interface\|type" --include="*.tsx" --include="*.ts" | grep -v "/types/" | grep -v "node_modules"`

`# 4. Run the high-speed project linter suite`  
`pnpm ci:lint:fast`

`# 5. Compile TypeScript definitions to ensure overall type cohesion`  
`npx tsc --noEmit`

`# 6. Execute local application bundle assembly`  
`pnpm build`

`# 7. Run automated unit and integration tests`  
`pnpm test`

## **3\. Systematic Engineering Checklist**

### **3.1 Technical Hygiene & Type Safety (P0)**

* \[ \] **No Console Statements:** All debug logging uses the centralized entity from @/lib/logger alongside correct visibility configurations (logger.debug, logger.info, logger.warn, logger.error).  
* \[ \] **No any Escapes:** Every variable declaration, function parameter requirement, and method return type provides explicit definitions.  
* \[ \] **Error Catch Typing:** Application catch blocks treat runtime errors as unknown rather than any (e.g., catch (error: unknown)).  
* \[ \] **Arbitrary Mapping Objects:** General key-value dictionaries use Record\<string, unknown\> instead of Record\<string, any\>.  
* \[ \] **Type Guards over Assertions:** Conditional evaluations implement type guard logic instead of inline modifications (e.g., utilizing isHandledError(response) rather than (response as any)?.\_\_isError).

### **3.2 Architectural Flow & Module Boundaries (P0/P1)**

* \[ \] **Layered Architecture Path:** Source logic adheres strictly to a unidirectional hierarchical layer pattern: Screen → Component → Hook → Service → Endpoint → Data. Higher layers can leverage lower boundaries, but lower tiers never reference parent implementations.  
* \[ \] **Centralized Type Locations:** Domain interfaces, application contracts, and shared guard declarations reside grouped inside the /types/ repository directory.  
* \[ \] **Entity Definition Completeness:** Adding a new domain configuration mandates matching updates across central definitions, including types/api.types.ts, hooks/use-action-toast.ts, and hooks/use-error-handler.ts.  
* \[ \] **DI Container Resolution:** Service operations are requested strictly through the global dependency context (e.g., container.userService). Manual constructor execution via new Service() is prohibited.

### **3.3 Presentational Layout & UI UX UX Design (P1)**

* \[ \] **Component Props Isolation:** Properties consumed by display components are formalized using separate, exported TypeScript interfaces.  
* \[ \] **Style Helper Integration:** Styling parameters (className?, disabled?) integrate cleanly through the structural utility handler cn() to manage class concatenation cleanly.  
* \[ \] **Asynchronous Operation Interface States:** Network or background promises must seamlessly steer the visible layout between three configuration states:

| App State | Implementation Strategy   |
| :---- | :---- |
| **In-Progress** | Display layout skeletons mirroring target geometry, loading spinners, or active component interaction disables. |
| **Success** | Smooth transitional visibility adjustments or confirmation notifications via toast.success(). |
| **Failure** | Inline contextual alert callouts or system notification toasts via toast.error() leveraging standard text builders. |

* \[ \] **Memory Leak Mitigation & List Management:** High-density or endless collections utilize virtualized list structures (FlatList, FlashList, or virtualized grids). Subscriptions, timers, or window listeners unbind completely inside structural cleanups.

## **4\. Mapping the SOLID Principles to Review Standards**

This code review framework translates theoretical Object-Oriented patterns directly into explicit repository verification rules:

* **Single Responsibility Principle (SRP):** Enforced through the strict separation of Presentation vs. Hooks vs. Services. View components handle layout presentation; services manage business calculation rules.  
* **Open/Closed Principle (OCP):** Enforced through the Shared Component Pattern. Shared components accept runtime configurations (e.g., columns, fields, structural styles) and are open for extension but closed to destructive alterations.  
* **Liskov Substitution Principle (LSP):** Dictates that interface abstractions and mock fixtures correspond perfectly with active production systems so that testing environments swap seamlessly without introducing specialized errors.  
* **Interface Segregation Principle (ISP):** Mandates isolated, focused props interfaces for user components. Presentational layers should never accept massive domain entity models when they only use a single value.  
* **Dependency Inversion Principle (DIP):** Implemented through the **P0 requirement** to resolve system layers through interfaces inside a centralized Dependency Injection (DI) context, preventing high-level systems from explicitly importing concrete child services.

## **5\. Standard Code Quality Comparisons**

**Replacing Production Console Expressions**

`// ❌ Incorrect / Blocked Pattern`  
`console.warn("API Request Latency Spike");`  
`console.log(internalPayload);`

`//  Correct / Approved Pattern`  
`import { logger } from "@/lib/logger";`  
`logger.warn("API Request Latency Spike");`  
`logger.debug(internalPayload);`

**Central Type Guards vs Unsafe Type Assertions**

`// ❌ Incorrect / Blocked Pattern`  
`if ((response as any)?.__isError) {`  
  `throw new Error((response as any).error);`  
`}`

`//  Correct / Approved Pattern`  
`// Declared permanently inside @/types/api.types`  
`function isHandledError(response: unknown): response is HandledError {`  
  `return (`  
    `typeof response === "object" &&`  
    `response !== null &&`  
    `"__isError" in response &&`  
    `(response as HandledError).__isError === true`  
  `);`  
`}`

`if (isHandledError(response)) {`  
  `throw new Error(response.error || "Execution Failed");`  
`}`

**Dynamic Classnames and Component Configuration**

`// ❌ Incorrect / Blocked Pattern`  
`interface ActionButtonProps {`  
  `text: string;`  
`}`  
`export function ActionButton({ text }: ActionButtonProps) {`  
  `return <button className="bg-blue-500 text-white">{text}</button>;`  
`}`

`//  Correct / Approved Pattern`  
`import { cn } from "@/lib/utils";`

`export interface ActionButtonProps {`  
  `text: string;`  
  `className?: string;`  
  `disabled?: boolean;`  
`}`

`export function ActionButton({ text, className, disabled }: ActionButtonProps) {`  
  `return (`  
    `<button`   
      `disabled={disabled}`  
      `className={cn("px-4 py-2 font-medium base-btn bg-blue-500 text-white", className)}`  
    `>`  
      `{text}`  
    `</button>`  
  `);`  
`}`

## **6\. Code Review Report Template**

Pull request evaluations should structure feedback using this standardized schema:

`# Code Review Report`

`**Date:** YYYY-MM-DD`    
`**Reviewer:** [Name / AI Agent Identifier]`    
`**PR/Branch Link:** #`  

`## 1. Quality Compliance Matrix`  
`| Priority Level | Discovered Violations | Merge Blocking Status |`  
`| :--- | :--- | :--- |`  
`| **P0 Critical** | 0 | [ Blocked / Clear ] |`  
`| **P1 High** | 0 | [ Action Required / Clear ] |`  
`| **P2 Medium / Low** | 0 | [ Optional ] |`

`## 2. Structural Findings`

`### 🛑 P0 — Critical Merge Blockers`  
`* **[File Location | Line Number]**: Description of rule deviation.`  
  `* *Required Remediating Action:* Step-by-step resolution plan.`

`### ⚠️ P1 — High Priority Issues`  
`* **[File Location | Line Number]**: Explanation of structural optimization opportunities.`  
  `* *Suggested Remediating Action:* Implementation pattern change.`

`## 3. Deployment Approval`  
`[ ❌ Changes Requested / Approved ]`

