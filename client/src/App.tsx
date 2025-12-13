import React from 'react';
import { DatabaseProvider } from './contexts/DatabaseContext';
import { DatabaseExplorer } from './components/DatabaseExplorer';
import { TabbedInterface } from './components/TabbedInterface';
import './App.css';

function App() {
  return (
    <DatabaseProvider>
      <div className="app">
        <header className="app-header">
          <h1>Seren Database Viewer</h1>
        </header>

        <div className="app-layout">
          <aside className="sidebar">
            <DatabaseExplorer />
          </aside>

          <main className="main-content">
            <TabbedInterface />
          </main>
        </div>
      </div>
    </DatabaseProvider>
  );
}

export default App;
