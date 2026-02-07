import React from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Copy } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log to console for debugging
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
  };

  handleHardReset = () => {
    window.location.reload();
  };

  handleCopyError = () => {
    const { error, errorInfo } = this.state;
    const text = `Error: ${error?.message || 'Unknown'}\n\nStack: ${error?.stack || 'N/A'}\n\nComponent Stack: ${errorInfo?.componentStack || 'N/A'}`;
    navigator.clipboard.writeText(text).catch(() => {});
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
          <div className="max-w-lg w-full">
            <div className="bg-slate-800 rounded-2xl border border-rose-500/30 shadow-2xl shadow-rose-500/10 overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-rose-600/20 to-orange-600/20 border-b border-rose-500/30 p-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center">
                    <AlertTriangle className="w-6 h-6 text-rose-400" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-white">Something went wrong</h1>
                    <p className="text-rose-300/70 text-sm mt-0.5">
                      {this.state.error?.message?.slice(0, 100) || 'An unexpected error occurred'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <p className="text-slate-300 text-sm">
                  Your data is safe — this is a display error. Try recovering first, or reload the page if it persists.
                </p>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={this.handleReset}
                    className="flex-1 px-4 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" /> Try to Recover
                  </button>
                  <button
                    onClick={this.handleHardReset}
                    className="px-4 py-3 bg-slate-700 hover:bg-slate-600 rounded-xl text-slate-300 font-medium transition-colors"
                  >
                    Reload Page
                  </button>
                </div>

                {/* Error Details (collapsible) */}
                <div className="border-t border-slate-700 pt-3">
                  <button
                    onClick={() => this.setState(s => ({ showDetails: !s.showDetails }))}
                    className="flex items-center gap-2 text-slate-500 hover:text-slate-300 text-xs transition-colors"
                  >
                    {this.state.showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    Technical Details
                  </button>
                  {this.state.showDetails && (
                    <div className="mt-2 space-y-2">
                      <div className="bg-slate-900 rounded-lg p-3 max-h-48 overflow-y-auto">
                        <pre className="text-rose-400/80 text-xs whitespace-pre-wrap break-all font-mono">
                          {this.state.error?.stack || 'No stack trace available'}
                        </pre>
                      </div>
                      {this.state.errorInfo?.componentStack && (
                        <div className="bg-slate-900 rounded-lg p-3 max-h-32 overflow-y-auto">
                          <p className="text-slate-500 text-xs mb-1">Component Stack:</p>
                          <pre className="text-slate-400 text-xs whitespace-pre-wrap break-all font-mono">
                            {this.state.errorInfo.componentStack}
                          </pre>
                        </div>
                      )}
                      <button
                        onClick={this.handleCopyError}
                        className="flex items-center gap-1 text-slate-500 hover:text-slate-300 text-xs"
                      >
                        <Copy className="w-3 h-3" /> Copy error for support
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
