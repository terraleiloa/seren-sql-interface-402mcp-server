# Instructions to Create Admin SQL Console (API Key Auth)

**Context**: 
I have an existing React Frontend and Express Backend for x402-paid queries. I now need to add a privileged **Admin Console** for Database Administrators.

**Goal**: 
Create a secure "SQL Console" interface that:
1.  Allows Admins to execute DDL (Create/Drop) and DML (Insert/Update) commands.
2.  **Bypasses x402 payments**: These requests must strictly use the `SEREN_API_KEY` (from `.env`) for authentication, NOT the `WALLET_PRIVATE_KEY` or x402 handshake.
3.  Provides a "SQL Console" experience with helper templates.

---

## Step 1: Update Backend Service (`serenService.ts`)
We need to add a "privileged" execution mode that uses the API Key instead of the payment protocol.

-   **Modify `src/services/serenService.ts`**:
    -   Add a new method: `executeAdminQuery(sql: string)` (or update `executeQuery` to accept an `isAdmin` flag).
    -   **Logic**:
        -   Do **NOT** perform the 402 retry loop.
        -   Make a direct POST request to the SerenDB endpoint (use the same URL as the query tool, or `https://x402.serendb.com/api/query` / equivalent admin endpoint).
        -   **Headers**: Attach the API Key explicitly.
            -   `Authorization: Bearer <process.env.SEREN_API_KEY>`
            -   (Or `x-api-key: <process.env.SEREN_API_KEY>` - check standard Seren docs).
        -   **Error Handling**: If this fails with 401/403, throw a clear "Admin Authentication Failed" error.

## Step 2: Add Backend Endpoint
-   **Modify `src/server.ts`**:
    -   Add a new route: `POST /api/admin/execute`
    -   **Middleware**: Ensure this endpoint is protected or at least distinct from the public `/execute-sql`.
    -   **Handler**: Call `serenService.executeAdminQuery(req.body.sql)`.

## Step 3: Frontend Architecture (Tabs)
-   **Modify `src/client/App.tsx`**:
    -   Implement a Tab system state: `activeTab` ('explorer' | 'admin').
    -   **Navigation**: Add a simplified header or sidebar to switch between "Public Explorer" and "Admin Console".
    -   **Preservation**: Keep the existing `SQLEditor` inside the 'explorer' tab.

## Step 4: Create `AdminConsole` Component
-   **Create `src/client/components/AdminConsole.tsx`**:
    -   **UI Layout** (Two Columns):
        -   **Left Sidebar (Templates)**:
            -   Title: "Quick Actions"
            -   Button List:
                -   "Create Table": Pastes `CREATE TABLE new_table (id SERIAL PRIMARY KEY, ...);`
                -   "Insert Row": Pastes `INSERT INTO table (col) VALUES (val);`
                -   "Update Row": Pastes `UPDATE table SET col = val WHERE id = ...;`
                -   "Drop Table": Pastes `DROP TABLE table_name;`
        -   **Main Area (Console)**:
            -   A dark-themed Textarea for SQL input (different visual style from the public editor to indicate "Admin Mode").
            -   **"Execute Admin Command" Button**: Style this distinctively (e.g., Red or Orange border) to indicate a write operation.
            -   **Output Console**: A terminal-like display for success messages (e.g., "Query executed successfully. 1 row affected") or detailed error logs.

## Step 5: Integration & Safety
-   **Environment Variable Check**:
    -   In `src/server.ts`, on startup, log a warning if `SEREN_API_KEY` is missing, as Admin functions will fail without it.
-   **Frontend State**:
    -   Ensure the Admin Console does *not* ask for a "Provider ID" if the Admin API Key is global to the project/database context (unless SerenDB requires a Provider ID even for admin ops, in which case add the input field).

**Implementation Order**:
1.  Update `SerenService` (Admin Mode).
2.  Add `/api/admin/execute` endpoint.
3.  Refactor App to use Tabs.
4.  Build `AdminConsole` UI.