Based on the **Frontend Rules** for the WebTrixPro CMS, here is the structured blueprint for your frontend development. This guide ensures you adhere to the mandatory TypeScript patterns, Next.js App Router conventions, and performance standards.

## ---

**\#\# 1\. Core Component & State Architecture**

You must categorize every piece of data and UI state using the following logic to ensure performance and maintainability:

### **\#\#\# State Management Decision Tree**

Before choosing a state tool, follow this hierarchy:

* **Is it Server Data?** Use **TanStack Query** (API data, caching, background syncing).  
* **Is it Shared & Persistent?** Use **Zand** (User preferences, theme, persistent filters).  
* **Is it Shared but Contextual?** Use **React Context** (Feature-level state, dependency injection).  
* **Is it UI-only/Local?** Use **useState** (Form inputs, modal toggles).

### **\#\#\# Component Structure (The "Standard Order")**

Every component file must follow this sequence:

1. **Imports:** External libraries first, then internal services/types.  
2. **Interfaces:** **Mandatory** explicit TypeScript prop interfaces (No any allowed).  
3. **Hooks:** React hooks first, then custom hooks.  
4. **Early Returns:** Explicit checks for isLoading, error, and \!data.length.  
5. **Main Render:** The primary JSX return.

## ---

**\#\# 2\. Next.js & UI Implementation**

### **\#\#\# Performance & Loading**

* **Skeleton Screens:** You must create loading.tsx files that mirror the final layout. Avoid generic spinners.  
* **Error Boundaries:** Critical components (like charts or complex data tables) must be wrapped in an \<ErrorBoundary\> to prevent the entire page from crashing.  
* **Image Optimization:** Use the Next.js \<Image\> component exclusively. Set priority for above-the-fold content.

### **\#\#\# Forms & Validation**

* **React Hook Form:** Integrated with zodResolver.  
* **Zod Schemas:** Stored centrally in /types/\[feature\]/\[feature\].schemas.ts.  
* **shadcn/ui:** Use the pre-built FormField components for consistent styling and error messaging.

## ---

**\#\# 3\. Data Fetching & Mutations**

All API interactions must pass through the **Service Layer** and **TanStack Query**.

* **Query Keys:** Must follow the hierarchy defined in lib/query-keys.ts (e.g., queryKeys.clients.detail(id)).  
* **Error Handling:** Hooks must use useGlobalErrorHandler to trigger standardized "sonner" toast notifications.  
* **Cache Invalidation:** Always call queryClient.invalidateQueries in the onSuccess block of a mutation.

## ---

**\#\# 4\. Frontend Review Checklist**

Before submitting a PR, ensure you can check off the following:

* \[ \] **Prop Interfaces:** Does every component have a TypeScript interface?  
* \[ \] **Accessibility:** Are there ARIA labels for icon-only buttons? Is keyboard navigation functional?  
* \[ \] **Loading/Empty States:** Does the UI handle the "No Data" and "Loading" scenarios gracefully?  
* \[ \] **Clean-up:** Are all useEffect intervals or event listeners cleared?  
* \[ \] **Logger:** Did you replace all console.log with the project's logger?

 