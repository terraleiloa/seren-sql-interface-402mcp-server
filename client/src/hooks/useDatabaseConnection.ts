import { useState } from 'react';
import axios from 'axios';
import { Connection } from '../contexts/DatabaseContext';

const API_BASE = 'http://localhost:3000';

interface QueryResult {
    success: boolean;
    rows?: any[];
    rowCount?: number;
    executionTime?: number;
    error?: string;
}

export function useDatabaseConnection() {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const testSqliteConnection = async (filePath: string): Promise<boolean> => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.post(`${API_BASE}/api/sqlite/connect`, {
                filePath,
            });
            return response.data.success;
        } catch (err: any) {
            setError(err.response?.data?.error || err.message);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const executeSqliteQuery = async (
        filePath: string,
        sql: string
    ): Promise<QueryResult> => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.post(`${API_BASE}/api/sqlite/execute`, {
                filePath,
                sql,
            });
            return response.data;
        } catch (err: any) {
            const errorMsg = err.response?.data?.error || err.message;
            setError(errorMsg);
            return {
                success: false,
                error: errorMsg,
            };
        } finally {
            setLoading(false);
        }
    };

    const listSqliteTables = async (filePath: string): Promise<any[]> => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(`${API_BASE}/api/sqlite/tables`, {
                params: { filePath },
            });
            return response.data.tables || [];
        } catch (err: any) {
            setError(err.response?.data?.error || err.message);
            return [];
        } finally {
            setLoading(false);
        }
    };

    const getSqliteTableSchema = async (
        filePath: string,
        tableName: string
    ): Promise<any> => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(
                `${API_BASE}/api/sqlite/schema/${tableName}`,
                {
                    params: { filePath },
                }
            );
            return response.data;
        } catch (err: any) {
            setError(err.response?.data?.error || err.message);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const getSqliteIndexes = async (
        filePath: string,
        tableName: string
    ): Promise<any[]> => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(
                `${API_BASE}/api/sqlite/indexes/${tableName}`,
                {
                    params: { filePath },
                }
            );
            return response.data.indexes || [];
        } catch (err: any) {
            setError(err.response?.data?.error || err.message);
            return [];
        } finally {
            setLoading(false);
        }
    };

    const getSqliteForeignKeys = async (
        filePath: string,
        tableName: string
    ): Promise<any[]> => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(
                `${API_BASE}/api/sqlite/foreign-keys/${tableName}`,
                {
                    params: { filePath },
                }
            );
            return response.data.foreignKeys || [];
        } catch (err: any) {
            setError(err.response?.data?.error || err.message);
            return [];
        } finally {
            setLoading(false);
        }
    };

    const executeDirectQuery = async (
        connectionString: string,
        sql: string
    ): Promise<QueryResult> => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.post(`${API_BASE}/api/direct/execute`, {
                connectionString,
                sql,
            });
            return response.data;
        } catch (err: any) {
            const errorMsg = err.response?.data?.error || err.message;
            setError(errorMsg);
            return {
                success: false,
                error: errorMsg,
            };
        } finally {
            setLoading(false);
        }
    };

    // PostgreSQL functions
    const listPostgresTables = async (connectionString: string): Promise<any[]> => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(`${API_BASE}/api/postgres/tables`, {
                params: { connectionString },
            });
            return response.data.tables || [];
        } catch (err: any) {
            setError(err.response?.data?.error || err.message);
            return [];
        } finally {
            setLoading(false);
        }
    };

    const getPostgresTableSchema = async (
        connectionString: string,
        tableName: string
    ): Promise<any> => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(
                `${API_BASE}/api/postgres/schema/${tableName}`,
                {
                    params: { connectionString },
                }
            );
            return response.data;
        } catch (err: any) {
            setError(err.response?.data?.error || err.message);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const getPostgresIndexes = async (
        connectionString: string,
        tableName: string
    ): Promise<any[]> => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(
                `${API_BASE}/api/postgres/indexes/${tableName}`,
                {
                    params: { connectionString },
                }
            );
            return response.data.indexes || [];
        } catch (err: any) {
            setError(err.response?.data?.error || err.message);
            return [];
        } finally {
            setLoading(false);
        }
    };

    const getPostgresForeignKeys = async (
        connectionString: string,
        tableName: string
    ): Promise<any[]> => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(
                `${API_BASE}/api/postgres/foreign-keys/${tableName}`,
                {
                    params: { connectionString },
                }
            );
            return response.data.foreignKeys || [];
        } catch (err: any) {
            setError(err.response?.data?.error || err.message);
            return [];
        } finally {
            setLoading(false);
        }
    };

    const getPostgresTableData = async (
        connectionString: string,
        tableName: string
    ): Promise<QueryResult> => {
        setLoading(true);
        setError(null);
        try {
            const response = await axios.get(
                `${API_BASE}/api/postgres/table-data/${tableName}`,
                {
                    params: { connectionString },
                }
            );
            return response.data;
        } catch (err: any) {
            const errorMsg = err.response?.data?.error || err.message;
            setError(errorMsg);
            return {
                success: false,
                error: errorMsg,
            };
        } finally {
            setLoading(false);
        }
    };

    return {
        loading,
        error,
        testSqliteConnection,
        executeSqliteQuery,
        listSqliteTables,
        getSqliteTableSchema,
        getSqliteIndexes,
        getSqliteForeignKeys,
        executeDirectQuery,
        listPostgresTables,
        getPostgresTableSchema,
        getPostgresIndexes,
        getPostgresForeignKeys,
        getPostgresTableData,
    };
}
