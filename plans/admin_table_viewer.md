# Instructions to Add Table Schema Viewer to Admin Console

**Context**: 
I have an `AdminConsole` component that currently allows executing raw SQL commands using the `SEREN_API_KEY`.
I need to add a **Schema Browser** feature so the Admin can view a list of existing tables and inspect their column configurations (types, constraints, etc.) without writing manual SQL queries.

**Goal**: 
1.  **Backend**: Add endpoints to retrieve the list of tables and specific table details via `information_schema`.
2.  **Frontend**: Update the `AdminConsole` sidebar to list these tables and display their structure when clicked.

---

## Step 1: Update `SerenService` for Schema Metadata
Since SerenDB is PostgreSQL-compatible, we can query the `information_schema` to get metadata.

-   **Modify `src/services/serenService.ts`**:
    -   Add `listTables()`:
        -   **SQL**: `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;`
        -   Execute this using the `executeAdminQuery` method (API Key auth).
    -   Add `getTableSchema(tableName: string)`:
        -   **SQL**: 
            ```sql
            SELECT column_name, data_type, is_nullable, column_default 
            FROM information_schema.columns 
            WHERE table_name = '${tableName}' 
            ORDER BY ordinal_position;
            ```
        -   *Note*: Sanitize `tableName` to prevent injection, or trust the Admin context (ensure it matches regex `^[a-zA-Z0-9_]+$`).

## Step 2: Add Admin API Endpoints
-   **Modify `src/server.ts`**:
    -   `GET /api/admin/tables`: Calls `serenService.listTables()`.
    -   `GET /api/admin/tables/:name`: Calls `serenService.getTableSchema(req.params.name)`.

## Step 3: Update `AdminConsole` UI
-   **Modify `src/client/components/AdminConsole.tsx`**:
    -   **Refactor Sidebar**: Split the "Left Sidebar" into two sections:
        1.  **Quick Actions** (Existing Templates).
        2.  **Database Schema** (New List).
    -   **Schema List**:
        -   Fetch the table list on component mount.
        -   Render table names as clickable items.
        -   Add a small "Refresh" icon button to re-fetch the list.
    -   **Interaction**:
        -   When a user clicks a Table Name in the sidebar:
            1.  Fetch the schema details for that table.
            2.  Display the results in the **Main Output Area** formatted as a clean grid/table (Column | Type | Nullable | Default).
            3.  (Optional) Add a button "Query Table" next to the schema view that pastes `SELECT * FROM table_name LIMIT 100;` into the editor.

## Step 4: Logic Flow
1.  Admin loads Admin Tab -> `GET /api/admin/tables` -> Sidebar populates.
2.  Admin clicks "users" table -> `GET /api/admin/tables/users`.
3.  Output Console clears -> Shows Table Structure.

**Implementation Order**:
1.  Add Service methods (SQL queries).
2.  Add Express Routes.
3.  Update Frontend Sidebar to fetch and list tables.
4.  Implement "Click to View Schema" logic.