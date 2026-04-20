import React, { useState, useEffect, useCallback } from 'react';
import { Search, Loader2, Download, Copy, CheckCircle2, RotateCcw } from 'lucide-react';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...classes) {
  return twMerge(clsx(classes));
}

function App() {
  const [url, setUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [progress, setProgress] = useState(null);
  const [emails, setEmails] = useState([]);
  const [keywords, setKeywords] = useState([]);
  const [activeKeyword, setActiveKeyword] = useState(null);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const extractKeywords = (emailList) => {
    const domainCounts = {};
    const prefixCounts = {};
    
    emailList.forEach(email => {
      const parts = email.split('@');
      if (parts.length !== 2) return;
      const [prefix, domain] = parts;
      
      domainCounts[domain] = (domainCounts[domain] || 0) + 1;
      prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
    });

    const kw = [];
    Object.entries(domainCounts).forEach(([word, count]) => {
      if (count > 0) kw.push({ word, type: 'domain', count });
    });
    Object.entries(prefixCounts).forEach(([word, count]) => {
      if (count > 0 && word.length > 2) kw.push({ word, type: 'prefix', count });
    });
    
    kw.sort((a, b) => b.count - a.count);
    return kw.slice(0, 15);
  };

  const startScraping = async (e) => {
    e.preventDefault();
    if (!url) return;
    
    setIsScraping(true);
    setProgress({ status: 'started', message: 'Connecting to server...' });
    setEmails([]);
    setKeywords([]);
    setError(null);
    setActiveKeyword(null);
    
    const clientId = Math.random().toString(36).substring(7);
    
    const sse = new window.EventSource(`https://email-scraper-a306.onrender.com/api/scrape/progress?clientId=${clientId}`);
    sse.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setProgress(data);
    };
    sse.onerror = () => {
      sse.close();
    };

    try {
      const response = await fetch('https://email-scraper-a306.onrender.com/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, clientId, maxPages: 25 })
      });
      
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to scrape URL');
      }
      
      setEmails(result.emails);
      setKeywords(extractKeywords(result.emails));
      setProgress({ status: 'finished', totalEmails: result.emails.length, scannedPages: result.scannedPages });
    } catch (err) {
      setError(err.message);
      setProgress(null);
    } finally {
      setIsScraping(false);
      sse.close();
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const downloadCSV = () => {
    const csvContent = "data:text/csv;charset=utf-8," + emails.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "extracted_emails.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredEmails = activeKeyword 
    ? emails.filter(e => e.includes(activeKeyword))
    : emails;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <header className="w-full pt-16 pb-8 px-4 flex flex-col items-center justify-center bg-white border-b shadow-sm">
        <div className="max-w-2xl w-full text-center space-y-6">
          <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 tracking-tight">
            Email Scraper Tool
          </h1>
          <p className="text-gray-500 text-lg">
            Enter a website URL to extract all email addresses recursively.
          </p>
          
          <form onSubmit={startScraping} className="relative w-full shadow-lg rounded-full overflow-hidden flex ring-1 ring-gray-200 focus-within:ring-2 focus-within:ring-blue-500 transition-all bg-white">
            <div className="pl-6 flex items-center justify-center text-gray-400">
              <Search size={22} />
            </div>
            <input
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full py-4 px-4 text-gray-700 outline-none text-lg bg-transparent"
              required
            />
            <button 
              type="submit" 
              disabled={isScraping}
              className="bg-blue-600 hover:bg-blue-700 text-white px-8 font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isScraping ? (
                <><Loader2 className="animate-spin" size={20} /> Crawling</>
              ) : (
                'Extract'
              )}
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto p-6 grid grid-cols-1 md:grid-cols-4 gap-8">
        
        <div className="md:col-span-1 space-y-6">
          
          {progress && (
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex flex-col gap-3">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                {isScraping ? <Loader2 size={16} className="animate-spin text-blue-500"/> : <CheckCircle2 size={16} className="text-green-500"/>}
                Status
              </h3>
              <div className="text-sm text-gray-600 break-words">
                {progress.status === 'started' && <p>{progress.message || 'Starting...'}</p>}
                {progress.status === 'scraping' && (
                  <div className="space-y-1">
                    <p className="font-medium text-blue-600">Scanning pages...</p>
                    <p>Pages Scanned: <span className="font-bold">{progress.pagesScanned}</span> / {progress.maxPages || 20}</p>
                    <p className="text-xs truncate" title={progress.currentUrl}>URL: {progress.currentUrl}</p>
                  </div>
                )}
                {progress.status === 'finished' && (
                  <div className="space-y-1">
                    <p className="font-medium text-green-600">Completed!</p>
                    <p>Total Emails: <span className="font-bold">{progress.totalEmails}</span></p>
                    {progress.scannedPages && <p>Pages Scanned: {progress.scannedPages}</p>}
                  </div>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-red-600 text-sm break-words">
              <strong>Error:</strong> {error}
            </div>
          )}

          {keywords.length > 0 && (
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-gray-800">Filter Tags</h3>
                {activeKeyword && (
                  <button type="button" onClick={() => setActiveKeyword(null)} className="text-xs text-blue-500 flex items-center gap-1 hover:underline">
                    <RotateCcw size={12} /> Reset
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {keywords.map((kw, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveKeyword(kw.word === activeKeyword ? null : kw.word)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-lg transition-colors border",
                      activeKeyword === kw.word 
                        ? "bg-blue-600 text-white border-blue-600" 
                        : "bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100"
                    )}
                  >
                    {kw.word} <span className="opacity-60 ml-1">({kw.count})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="md:col-span-3">
          {emails.length > 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
              
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h2 className="font-bold text-gray-800">
                  {activeKeyword ? `Results for "${activeKeyword}"` : "Extracted Emails"}
                  <span className="ml-2 text-sm font-normal text-gray-500">({filteredEmails.length})</span>
                </h2>
                <button 
                  type="button"
                  onClick={downloadCSV}
                  className="flex items-center gap-2 text-sm bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg transition-colors font-medium shadow-sm"
                >
                  <Download size={16} /> Export CSV
                </button>
              </div>

              <div className="max-h-[600px] overflow-y-auto p-2">
                {filteredEmails.length > 0 ? (
                  <ul className="space-y-1">
                    {filteredEmails.map((email, idx) => (
                      <li key={idx} className="group flex justify-between items-center px-4 py-3 hover:bg-blue-50 rounded-xl transition-colors">
                        <a href={`mailto:${email}`} className="text-gray-700 group-hover:text-blue-700 font-medium truncate pr-4">
                          {email}
                        </a>
                        <button 
                          type="button"
                          onClick={() => copyToClipboard(email)}
                          className="text-gray-400 hover:text-blue-600 p-2 rounded-md hover:bg-blue-100 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
                          title="Copy to clipboard"
                        >
                          {copiedId === email ? <CheckCircle2 size={18} className="text-green-500" /> : <Copy size={18} />}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    No emails match the selected filter.
                  </div>
                )}
              </div>
            </div>
          ) : (
            !isScraping && !error && (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 p-12 border-2 border-dashed border-gray-200 rounded-2xl">
                <Search size={48} className="mb-4 opacity-20" />
                <p className="text-lg">No results yet.</p>
                <p className="text-sm mt-2">Enter a URL above to start extracting emails.</p>
              </div>
            )
          )}
        </div>

      </main>
    </div>
  );
}

export default App;
