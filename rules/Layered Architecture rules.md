 

## ---

**\#\# 1\. The Architectural Blueprint**

All features must strictly follow this six-layer sequence to ensure maintainability:

### **\#\#\# Layer Definitions & Responsibilities**

* **Screen Layer (/app/\[feature\]/page.tsx):** Next.js Server Components that fetch initial data and manage route-level loading/error states.  
* **Component Layer (/components/\[feature\]/):** React UI components that handle user interactions and display data via props.  
* **Hook Layer (/hooks/use-\[feature\].ts):** Manages business logic and TanStack Query integration, utilizing the Service layer (never direct API calls).  
* **Service Layer (/lib/services/\[feature\]/):** Orchestrates API calls by extending BaseService and provides a clean interface for hooks.  
* **Endpoint Layer (/app/api/v1/):** Next.js API routes that handle Zod validation, Auth0 authentication, and database execution.  
* **Data Layer (/lib/db/connection.ts):** Manages PostgreSQL connection pooling and executes raw, parameterized SQL queries.

## ---

**\#\# 2\. Feature-Based Organization**

The project is organized by "Feature Modules." Each feature is self-contained to prevent spaghetti dependencies:

| Layer | File Path Pattern |
| :---- | :---- |
| **UI Screen** | /app/clients/page.tsx |
| **UI Components** | /components/clients/ClientsList.tsx |
| **Logic (Hook)** | /hooks/use-clients.ts |
| **API Orchestration** | /lib/services/clients/ClientService.ts |
| **API Route** | /app/api/v1/clients/route.ts |
| **Schemas/Types** | /types/client/client.schemas.ts |

## ---

**\#\# 3\. Core Implementation Rules**

* **BaseService Pattern:** All services **must** extend BaseService to inherit standard CRUD methods (list, get, create, update, delete).  
* **Cross-Feature Dependencies:** If one feature needs data from another, it **must** import from that feature's **Service Layer**, never its hooks or components.  
* **Query Key Hierarchy:** TanStack Query keys must be centralized in lib/query-keys.ts and follow a strict hierarchy (e.g., all \-\> lists \-\> details).  
* **Parameterized SQL:** Raw SQL in the Endpoint layer must **always** use parameterization (e.g., $1, $2) to prevent injection attacks.

## ---

**\#\# 4\. Feature Implementation Checklist**

When starting a new feature, implement in this order:

* \[ \] **Define Types/Schemas:** Create Zod schemas and TypeScript interfaces in /types/.  
* \[ \] **Create Service:** Extend BaseService and export a singleton from services/index.ts.  
* \[ \] **Build API Route:** Create the Next.js route handler with Zod validation and raw SQL.  
* \[ \] **Develop Hook:** Create a custom hook using TanStack Query and useGlobalErrorHandler.  
* \[ \] **Build UI:** Create components and the final Screen page.

 