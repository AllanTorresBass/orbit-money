# **Code Review Checklist**

This checklist ensures code quality, type safety, and adherence to project standards before merging PRs.

## **P0 CRITICAL Issues \- Must Fix Before Merge**

### **Console Statements**

* \[ \] **No console statements**: Verify no console.log(), console.warn(), console.error(), or console.info() in code  
* \[ \] **Logger usage**: All logging uses logger from @/lib/logger  
* \[ \] **Log levels**: Appropriate log levels used (logger.debug(), logger.info(), logger.warn(), logger.error())  
* \[ \] **Search command**: Run grep \-r "console\\." \--include="\*.ts" \--include="\*.tsx" to find any console statements

### **Type Safety \- Any Types**

* \[ \] **No any types**: Verify no any types in code (variables, parameters, return types)  
* \[ \] **No as any assertions**: Verify no as any type assertions  
* \[ \] **Proper types**: All types are properly defined (interfaces, types, unions)  
* \[ \] **Union types**: Use union types (string | number) instead of any when parameters can accept multiple types  
* \[ \] **Type guards**: Use type guards instead of type assertions (e.g., isHandledError() instead of (response as any)?.\_\_isError)  
* \[ \] **Type guard imports**: Type guards are imported from centralized locations (e.g., @/types/api.types)  
* \[ \] **Error handling**: Error handling uses type guards (isHandledDuplicate, isHandledRateLimit) instead of (result as any)?.\_\_handledDuplicate  
* \[ \] **Unknown for errors**: Catch blocks use unknown instead of any: catch (error: unknown)  
* \[ \] **Record types**: Use Record\<string, unknown\> instead of Record\<string, any\>  
* \[ \] **Search command**: Run grep \-r ":\\s\*any\\b\\|as any" \--include="\*.ts" \--include="\*.tsx" to find any types

### **Type Centralization**

* \[ \] **All types in /types/**: Verify all types are imported from /types/ directory  
* \[ \] **No local types**: Verify no type definitions in components, hooks, or services  
* \[ \] **No duplicate types**: Verify no duplicate type definitions across files  
* \[ \] **Barrel exports**: Types are exported from /types/index.ts when appropriate  
* \[ \] **Mock data types**: No types imported from mock data files \- all from /types/  
* \[ \] **EntityType usage**: Verify entity types use centralized EntityType union and isValidEntityType() type guard  
* \[ \] **EntityType completeness**: When adding new entities, verify all EntityType definitions are updated (types/api.types.ts, hooks/use-action-toast.ts, hooks/use-error-handler.ts)  
* \[ \] **Search command**: Run grep \-r "interface\\|type" \--include="\*.tsx" \--include="\*.ts" | grep \-v "/types/" | grep \-v "node\_modules" to find local type definitions

### **Component Props**

* \[ \] **Props interfaces**: All component props are defined in TypeScript interfaces  
* \[ \] **Common props**: Common props like className?, disabled? are included in interfaces  
* \[ \] **className support**: Components accept and forward className prop using cn() utility  
* \[ \] **Prop exports**: Prop interfaces are exported for reuse

### **React & Hooks Quality**
* [ ] **Hook Dependencies**: All `useEffect`, `useMemo`, and `useCallback` hooks have accurate dependency arrays.
* [ ] **Async Cleanups**: Long-running or fetched side effects inside components utilize `AbortController` or cleanup functions to prevent memory leaks/race conditions.
* [ ] **Zod Type Inference**: Use `z.infer<typeof schema>` for form/API data validation structures instead of manually writing duplicate interfaces.
* [ ] **File Size & Responsibility**: Files should generally stay under 300 lines. If a file exceeds this, verify if logic can be extracted into custom hooks, helper utilities, or sub-components.
### **Security & Environment**
* [ ] **Environment Variables**: Any new environment variables are added to `.env.example` and integrated into the app's runtime configuration validation layer.
* [ ] **No Secret Leaks**: Double-check that API keys, webhook secrets, or unencrypted PII are not logged, exposed in client bundles, or hardcoded.
* [ ] **Strict Parameterization**: SQL or database operations are strictly parameterized; zero raw string interpolation allowed.

## **P1 HIGH Priority Issues \- Should Fix Immediately**

### **Type Guards**

* \[ \] **Type guard functions**: Error handling uses type guard functions (e.g., isHandledError, isHandledDuplicate, isHandledRateLimit)  
* \[ \] **Type guard imports**: Type guards are imported at the top of files from centralized locations (e.g., import { isHandledDuplicate, isHandledRateLimit } from "@/types/api.types")  
* \[ \] **Centralized guards**: Type guards are exported from centralized locations (e.g., @/types/api.types)  
* \[ \] **No inline checks**: No inline type checks like (response as any)?.\_\_isError or (result as any)?.\_\_handledDuplicate  
* \[ \] **Proper usage**: Type guards are used in conditionals: if (isHandledDuplicate(result) || isHandledRateLimit(result))

### **Error Handling**

* \[ \] **Global error handler**: Uses useGlobalErrorHandler for error management  
* \[ \] **Type guards**: Error detection uses type guards instead of type assertions  
* \[ \] **Consistent patterns**: Error handling follows established patterns

### **Database & API**

* \[ \] **Connection management**: Uses getClient() helper instead of pool.connect()  
* \[ \] **Transaction safety**: Uses withTransaction() helper for transactions  
* \[ \] **Error responses**: Proper error response types and handling

## **Code Quality Checks**

### **TypeScript**

* \[ \] **Type safety**: All code is properly typed  
* \[ \] **No implicit any**: TypeScript strict mode enabled  
* \[ \] **Centralized types**: **MANDATORY** \- All types imported from /types/ directory  
* \[ \] **No local types**: No type definitions in components, hooks, or services  
* \[ \] **Type consistency**: Database, API, and TypeScript types match  
* \[ \] **No any types**: Zero tolerance \- no any types anywhere in code  
* \[ \] **Type guards**: Use type guards instead of type assertions

### **Architecture**

* \[ \] **Layered architecture**: Follows Screen → Component → Hook → Service → Endpoint → Data pattern  
* \[ \] **Repository pattern**: Data access uses repository pattern  
* \[ \] **Service layer**: Business logic in service layer  
* \[ \] **No duplication**: No duplicate queries or logic

### **Security**

* \[ \] **Input validation**: All inputs validated with Zod schemas  
* \[ \] **Rate limiting**: All API endpoints have rate limiting  
* \[ \] **SQL injection**: No SQL injection vulnerabilities  
* \[ \] **JSON parsing**: All JSON.parse() calls wrapped in try-catch

### **Performance**

* \[ \] **Query optimization**: Database queries are optimized  
* \[ \] **Caching**: Appropriate caching strategies used  
* \[ \] **Pagination**: Lists use pagination with appropriate limits

## **Testing & Documentation**

### **Testing**

* \[ \] **Unit tests**: Unit tests for new functionality  
* \[ \] **Integration tests**: Integration tests for API endpoints  
* \[ \] **E2E tests**: E2E tests for critical user flows  
* \[ \] **Test coverage**: Maintain high test coverage

### **Documentation**

* \[ \] **Code comments**: Complex logic has comments  
* \[ \] **JSDoc**: Hooks and functions have JSDoc comments  
* \[ \] **README updates**: README updated if needed  
* \[ \] **Migration docs**: Database migrations documented

## **Pre-Merge Verification**

### **Build & Lint**

* \[ \] **Build passes**: pnpm build completes successfully  
* \[ \] **Lint passes**: pnpm ci:lint:fast passes with zero warnings  
* \[ \] **Type check**: TypeScript compilation succeeds  
* \[ \] **Prettier**: Code formatted with Prettier

### **Manual Testing**

* \[ \] **Functionality**: New features work as expected  
* \[ \] **Error handling**: Error cases handled gracefully  
* \[ \] **Responsive design**: UI works on mobile (360px width)  
* \[ \] **Accessibility**: Keyboard navigation and screen readers work

## **Automated Checks**

Run these commands before creating a PR:

`# Check for console statements`  
`grep -r "console\." --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v ".next"`

`# Check for any types`  
`grep -r ":\s*any\b\|as any" --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v ".next"`

`# Run linting`  
`pnpm ci:lint:fast`

`# Run build`  
`pnpm build`

`# Run tests`  
`pnpm test`

## **Common Issues & Solutions**

### **Issue: Console statements found**

**Solution**: Replace with logger from @/lib/logger

`// ❌ Wrong`  
`console.warn("Warning message");`  
`console.log("Debug info");`

`//  Correct`  
`import { logger } from "@/lib/logger";`  
`logger.warn("Warning message");`  
`logger.debug("Debug info");`

### **Issue: any type found**

**Solution**: Use proper types or type guards

`// ❌ Wrong`  
`const workItemPayload: any = { ... };`  
`if ((response as any)?.__isError) { ... }`

`//  Correct`  
`const workItemPayload: UpdateEstimateWorkItemInput = { ... };`  
`if (isHandledError(response)) { ... }`

### **Issue: Missing className prop**

**Solution**: Add className? to props interface and use cn() utility

`// ❌ Wrong`  
`interface MyComponentProps {`  
  `value: string;`  
  `// Missing className`  
`}`

`//  Correct`  
`interface MyComponentProps {`  
  `value: string;`  
  `className?: string;`  
`}`

`export function MyComponent({ value, className }: MyComponentProps) {`  
  `return <div className={cn("default-classes", className)}>{value}</div>;`  
`}`

### **Issue: Type assertion instead of type guard**

**Solution**: Create and use type guard function

`// ❌ Wrong`  
`if ((response as any)?.__isError) {`  
  `throw new Error((response as any).error);`  
`}`

`//  Correct`  
`function isHandledError(response: unknown): response is HandledError {`  
  `return (`  
    `typeof response === "object" &&`  
    `response !== null &&`  
    `"__isError" in response &&`  
    `(response as HandledError).__isError === true`  
  `);`  
`}`

`if (isHandledError(response)) {`  
  `throw new Error(response.error || "Failed");`  
`}`

## **Review Process**

1. **Self-Review**: Run automated checks before requesting review  
2. **Peer Review**: Request review from team member  
3. **Address Feedback**: Fix all P0 and P1 issues  
4. **Re-verify**: Run checks again after fixes  
5. **Merge**: Only merge after all checks pass



## **Notes**

* **P0 Issues**: Block merge \- must be fixed immediately  
* **P1 Issues**: Should be fixed before merge \- discuss with team if blocking  
* **Code Quality**: Address all issues before merge  
* **Documentation**: Keep documentation up-to-date
