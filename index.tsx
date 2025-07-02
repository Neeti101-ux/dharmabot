import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './contexts/ThemeContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);

// Register Service Worker for PWA functionality
// Check if we're in a supported environment (not StackBlitz)
const isStackBlitz = window.location.hostname.includes('stackblitz') || 
                    window.location.hostname.includes('webcontainer');

if ('serviceWorker' in navigator && !isStackBlitz) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((registration) => {
        console.log('Service Worker registered successfully:', registration.scope);
        
        // Check for updates
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New content is available, prompt user to refresh
                if (confirm('New version available! Refresh to update?')) {
                  window.location.reload();
                }
              }
            });
          }
        });
      })
      .catch((error) => {
        console.error('Service Worker registration failed:', error);
      });
  });
} else if (isStackBlitz) {
  console.log('Service Worker registration skipped: Running in StackBlitz environment');
}

// Handle PWA install prompt
let deferredPrompt: any;

// Only set up PWA install prompt if not in StackBlitz
if (!isStackBlitz) {
  window.addEventListener('beforeinstallprompt', (e) => {
    console.log('PWA install prompt triggered');
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
    
    // Show custom install button or notification
    showInstallPromotion();
  });
}

function showInstallPromotion() {
  // Create a subtle install promotion
  const installBanner = document.createElement('div');
  installBanner.id = 'install-banner';
  installBanner.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: linear-gradient(135deg, #dc2626, #b91c1c);
      color: white;
      padding: 12px 16px;
      text-align: center;
      font-size: 14px;
      z-index: 9999;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      transform: translateY(-100%);
      transition: transform 0.3s ease-in-out;
    ">
      <div style="display: flex; align-items: center; justify-content: center; gap: 12px; max-width: 600px; margin: 0 auto;">
        <span>📱 Install Dharmabot for quick access to legal assistance</span>
        <button id="install-button" style="
          background: rgba(255,255,255,0.2);
          border: 1px solid rgba(255,255,255,0.3);
          color: white;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          cursor: pointer;
          transition: background 0.2s;
        " onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">
          Install
        </button>
        <button id="dismiss-install" style="
          background: transparent;
          border: none;
          color: rgba(255,255,255,0.8);
          font-size: 18px;
          cursor: pointer;
          padding: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          ×
        </button>
      </div>
    </div>
  `;
  
  document.body.appendChild(installBanner);
  
  // Animate in
  setTimeout(() => {
    const banner = document.getElementById('install-banner');
    if (banner) {
      banner.style.transform = 'translateY(0)';
    }
  }, 1000);
  
  // Handle install button click
  document.getElementById('install-button')?.addEventListener('click', async () => {
    if (deferredPrompt) {
      // Show the install prompt
      deferredPrompt.prompt();
      
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User response to install prompt: ${outcome}`);
      
      // Clear the deferredPrompt
      deferredPrompt = null;
      
      // Remove the banner
      const banner = document.getElementById('install-banner');
      if (banner) {
        banner.style.transform = 'translateY(-100%)';
        setTimeout(() => banner.remove(), 300);
      }
    }
  });
  
  // Handle dismiss button click
  document.getElementById('dismiss-install')?.addEventListener('click', () => {
    const banner = document.getElementById('install-banner');
    if (banner) {
      banner.style.transform = 'translateY(-100%)';
      setTimeout(() => banner.remove(), 300);
    }
    // Store dismissal in localStorage to avoid showing again for a while
    localStorage.setItem('installPromptDismissed', Date.now().toString());
  });
  
  // Auto-dismiss after 10 seconds
  setTimeout(() => {
    const banner = document.getElementById('install-banner');
    if (banner) {
      banner.style.transform = 'translateY(-100%)';
      setTimeout(() => banner.remove(), 300);
    }
  }, 10000);
}

// Handle successful installation
if (!isStackBlitz) {
  window.addEventListener('appinstalled', () => {
    console.log('PWA was installed successfully');
    // Hide any install promotion
    const banner = document.getElementById('install-banner');
    if (banner) {
      banner.remove();
    }
    deferredPrompt = null;
  });
}

// Check if app is running in standalone mode (installed as PWA)
if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) {
  console.log('App is running in standalone mode (PWA)');
  // Add any PWA-specific styling or behavior
  document.documentElement.classList.add('pwa-mode');
}