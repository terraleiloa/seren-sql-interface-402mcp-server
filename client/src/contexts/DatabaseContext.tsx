import React, { createContext, useContext, useState, ReactNode } from 'react';

export interface Connection {
    id: string;
    name: string;
    type: 'sqlite' | 'postgres' | 'x402';
    filePath?: string;
    connectionString?: string;
    providerId?: string;
}

export interface Tab {
    id: string;
    title: string;
    type: 'sql-editor' | 'table-viewer' | 'direct-connection';
    connection?: Connection;
    tableName?: string;
}

interface DatabaseContextType {
    connections: Connection[];
    addConnection: (connection: Connection) => void;
    removeConnection: (id: string) => void;
    activeConnection?: Connection;
    setActiveConnection: (connection: Connection | undefined) => void;
    tabs: Tab[];
    addTab: (tab: Tab) => void;
    removeTab: (id: string) => void;
    activeTabId?: string;
    setActiveTabId: (id: string | undefined) => void;
    theme: 'light' | '  dark';
    setTheme: (theme: 'light' | 'dark') => void;
}

const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

export function DatabaseProvider({ children }: { children: ReactNode }) {
    const [connections, setConnections] = useState<Connection[]>([]);
    const [activeConnection, setActiveConnection] = useState<Connection | undefined>();
    const [tabs, setTabs] = useState<Tab[]>([
        {
            id: 'default-sql-editor',
            title: 'SQL Editor',
            type: 'sql-editor',
        },
    ]);
    const [activeTabId, setActiveTabId] = useState<string>('default-sql-editor');
    const [theme, setTheme] = useState<'light' | 'dark'>('dark');

    const addConnection = (connection: Connection) => {
        setConnections((prev) => [...prev, connection]);
    };

    const removeConnection = (id: string) => {
        setConnections((prev) => prev.filter((c) => c.id !== id));
    };

    const addTab = (tab: Tab) => {
        setTabs((prev) => [...prev, tab]);
        setActiveTabId(tab.id);
    };

    const removeTab = (id: string) => {
        setTabs((prev) => {
            const filtered = prev.filter((t) => t.id !== id);
            // If active tab is being removed, switch to first tab
            if (activeTabId === id && filtered.length > 0) {
                setActiveTabId(filtered[0].id);
            }
            return filtered;
        });
    };

    return (
        <DatabaseContext.Provider
            value={{
                connections,
                addConnection,
                removeConnection,
                activeConnection,
                setActiveConnection,
                tabs,
                addTab,
                removeTab,
                activeTabId,
                setActiveTabId,
                theme,
                setTheme,
            }}
        >
            {children}
        </DatabaseContext.Provider>
    );
}

export function useDatabaseContext() {
    const context = useContext(DatabaseContext);
    if (!context) {
        throw new Error('useDatabaseContext must be used within DatabaseProvider');
    }
    return context;
}
