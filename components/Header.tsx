import React from 'react';
import { ThemeToggle } from './ThemeToggle';

interface HeaderProps {
  onNavigateToDocumentation?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onNavigateToDocumentation }) => {
  return (
    <header className="bg-white dark:bg-slate-900 shadow-lg border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50">
      <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between">
        <div className="flex items-center">
          <h1 className="text-2xl sm:text-3xl font-bold">
            <span className="text-slate-800 dark:text-gray-100">Dharma</span>
            <span className="text-red-600 dark:text-red-500">bot</span>
          </h1>
        </div>
        <div className="flex items-center space-x-2 sm:space-x-3">
          {onNavigateToDocumentation && (
            <button
              onClick={onNavigateToDocumentation}
              className="p-2 rounded-md text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-all duration-150 hover:scale-110 active:scale-95"
              aria-label="View Documentation"
              title="Documentation"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </button>
          )}
          <ThemeToggle />
          <a
            href="https://dharmabot.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm font-semibold rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 transition-all duration-150 hover:scale-105 active:scale-95 inline-block text-center"
          >
            Ask Neeti
          </a>
        </div>
      </div>
    </header>
  );
};