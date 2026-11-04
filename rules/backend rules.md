Based on the **WebTrixPro CMS** backend rules provided, here is the structured architectural blueprint you should follow for your new project. This structure ensures strict compliance with the "No-ORM," "Service Layer," and "Next.js App Router" requirements.

## ---

**\#\# 1\. Project Directory Structure**

You should organize your codebase to separate the data access layer (SQL), the business logic (Services), and the transport layer (API Routes).

Plaintext

/  
├── app/  
│   └── api/  
│       └── v1/  
│           └── \[feature\]/  
│               └── route.ts           \# API Route Handlers  
├── lib/  
│   ├── auth/  
│   │   └── permissions.ts             \# RBAC logic  
│   ├── db/  
│   │   └── connection.ts              \# pg Pool configuration  
│   ├── services/  
│   │   ├── base/  
│   │   │   └── BaseService.ts         \# Abstract class for all services  
│   │   ├── \[feature\]/  
│   │   │   └── FeatureService.ts      \# Feature-specific logic  
│   │   └── index.ts                   \# Central service export  
│   └── logger.ts                      \# Centralized logging utility  
├── types/  
│   └── \[feature\]/  
│       ├── feature.types.ts           \# TypeScript interfaces  
│       └── feature.schemas.ts         \# Zod validation schemas  
└── middleware.ts                      \# Rate limiting and Auth

## ---

**\#\# 2\. Core Implementation Rules**

### **\#\#\# Database: Raw SQL Only**

* **No ORMs:** Never use Prisma, Drizzle, or TypeORM.  
* **Safety:** You **must** use parameterized queries (e.g., VALUES ($1, $2)) to prevent SQL injection.  
* **Soft Deletes:** Data should not be hard-deleted; update a deleted\_at timestamp instead.

### **\#\#\# The Service Layer**

* Every service file must extend the BaseService class.  
* **Logging:** Use a centralized logger, never console.log.  
* **Exports:** All services must be instantiated and exported from lib/services/index.ts.

### **\#\#\# API & Security**

* **Routing:** Follow the pattern /api/v1/\[feature\]/route.ts.  
* **Validation:** Use **Zod** to parse every incoming request body.  
* **Auth:** Use Auth0 for session management and verify permissions before executing logic.  
* **Status Codes:** Use explicit codes (201 for creation, 400 for validation errors, 404 for missing records).

## ---

**\#\# 3\. Development Checklist**

Use this to verify every new feature you build:

| Layer | Requirement |
| :---- | :---- |
| **Database** | Is this raw SQL using $1, $2 parameters? |
| **Service** | Does this extend BaseService and log via logger? |
| **Security** | Is there a Zod schema validating the input? |
| **Security** | Is getSession used to check authentication? |
| **API** | Does the route return consistent JSON error objects? |

### ---

**\#\#\# Quick Example: POST Handler Template**

TypeScript

export async function POST(request: NextRequest) {  
  try {  
    const body \= await request.json();  
    const validated \= schema.parse(body); // Validation  
      
    const result \= await db.query(  
      'INSERT INTO table (col) VALUES ($1) RETURNING \*',   
      \[validated.col\]  
    ); // Raw SQL  
      
    return NextResponse.json(result.rows\[0\], { status: 201 });  
  } catch (error) {  
    logger.error('\[API\] Context:', error); // Centralized logging  
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });  
  }  
}

 