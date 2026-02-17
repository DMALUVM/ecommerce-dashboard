import React from 'react';
import { BarChart3 } from 'lucide-react';

export default function LandingFooter() {
  return (
    <footer className="border-t border-slate-800/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold text-white">EcommDashboard</span>
          </div>

          {/* Links */}
          <div className="flex items-center gap-6 text-sm">
            <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors">
              Privacy Policy
            </a>
            <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:text-slate-300 transition-colors">
              Terms of Service
            </a>
            <a href="mailto:support@ecommdashboard.com" className="text-slate-500 hover:text-slate-300 transition-colors">
              Support
            </a>
          </div>

          {/* Copyright */}
          <p className="text-xs text-slate-600">
            &copy; {new Date().getFullYear()} EcommDashboard. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
