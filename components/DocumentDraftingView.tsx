Here's the fixed version with the missing closing bracket for the button element and the closing brace for the component:

```typescript
            <button
              onClick={handleDictateClick}
              disabled={isLoading || isTranscribing}
              className={`flex-grow sm:flex-grow-0 px-4 py-2 text-sm sm:text-base font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-opacity-50 flex items-center justify-center sm:min-w-[160px]
                ${isRecording ? 'bg-yellow-500 hover:bg-yellow-600 focus:ring-yellow-400' : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'}
                ${isTranscribing ? 'bg-gray-400 cursor-not-allowed' : ''}
              `}
            >
              {isTranscribing ? (
                <>
                  <SpinnerIcon className="-ml-1 mr-2 h-5 w-5 text-white" />
                  Transcribing...
                </>
              ) : isRecording ? (
                <>
                  <StopIcon className="-ml-1 mr-2 w-5 h-5" /> Stop Recording
                </>
              ) : (
                <>
                  <MicIcon className="-ml-1 mr-2 w-5 h-5" /> Dictate
                </>
              )}
            </button>
          </div>
        </div>

        {/* Section 2: Document Editor */}
        <div className="space-y-3 p-3 sm:p-4 bg-white dark:bg-slate-800 shadow-lg rounded-lg flex-grow flex flex-col min-h-0 animate-fade-in-slide-up"> 
          <h3 className="text-lg sm:text-xl font-semibold text-slate-700 dark:text-slate-200">2. Edit & Export Document</h3>
          
          <div>
            <label htmlFor="documentTitle" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Document Title:
            </label>
            <input
              type="text"
              id="documentTitle"
              value={currentTitle}
              onChange={(e) => onTitleChange(e.target.value)}
              className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-700 text-slate-900 dark:text-gray-100 focus:ring-red-500 focus:border-red-500 text-sm"
              placeholder="Enter document title"
            />
          </div>
          
          <div className="mb-3 space-y-2"> 
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-md font-medium text-slate-700 dark:text-slate-300">Actions:</h4>
                <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={handleSaveDraft} 
                      disabled={isProcessing || (!currentInstructions.trim() && !currentContent.trim())} 
                      className="px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                    >
                      {isProcessing ? 'Processing...' : 'Save Draft'}
                    </button>
                    <button onClick={handleExportDOCX} disabled={isLoading || !currentContent.trim()} className="px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                        {isLoading && 'Processing...' || 'Export DOCX'}
                    </button>
                    <button onClick={handleExportTXT} disabled={isLoading || !currentContent.trim()} className="px-3 py-1.5 text-xs sm:text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
                         {isLoading && 'Processing...' || 'Export TXT'}
                    </button>
                </div>
            </div>
          </div>

          <div className="flex-grow border border-slate-300 dark:border-slate-700 rounded-md"> 
            <RichTextEditor value={currentContent} onChange={onContentChange} placeholder="AI generated document will appear here. You can also start typing..." />
          </div>
        </div>
        
        {(isLoading || isTranscribing) && !error && !dictationError && <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in" aria-live="assertive" aria-atomic="true">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-2xl flex items-center space-x-4">
                <SpinnerIcon className="h-8 w-8 text-red-500" />
                <span className="text-slate-700 dark:text-slate-300 text-lg">
                    {isLoading ? 'Generating document...' : 'Processing audio...'}
                </span>
            </div>
        </div>}

      </main>
      <Footer />
    </div>
  );
};
```