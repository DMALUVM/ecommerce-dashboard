import React from 'react';
import { AlertTriangle, RefreshCw, ChevronDown, ChevronUp, Copy } from 'lucide-react';

/**
 * Enhanced ErrorBoundary — wraps view sections so a crash in one tab
 * doesn't take down the entire app. Shows a friendly recovery UI with
 * expandable technical details and copy-to-clipboard for debugging.
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, showDetails: false, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error(`[ErrorBoundary${this.props.name ? ` — ${this.props.name}` : ''}]`, error, errorInfo?.componentStack?.slice(0, 800));
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false, copied: false });
  };

  handleHardReset = () => {
    window.location.reload();
  };

  handleCopyError = () => {
    const { error, errorInfo } = this.state;
    const text = [
      `Error: ${error?.message || 'Unknown'}`,
      `View: ${this.props.name || 'Unknown'}`,
      `Time: ${new Date().toISOString()}`,
      `\nStack:\n${error?.stack || 'N/A'}`,
      `\nComponent Stack:\n${errorInfo?.componentStack || 'N/A'}`,
    ].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    }).catch(() => {});
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <div className="max-w-lg w-full">
            <div className="bg-slate-800/80 rounded-2xl border border-rose-500/30 shadow-xl overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-rose-600/20 to-orange-600/20 border-b border-rose-500/20 p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 text-rose-400" />
                  </div>
                  <div className="text-left">
                    <h2 className="text-lg font-bold text-white">
                      {this.props.name ? `${this.props.name} hit an error` : 'Something went wrong'}
                    </h2>
                    <p className="text-rose-300/70 text-sm mt-0.5 line-clamp-2">
                      {this.state.error?.message?.slice(0, 120) || 'An unexpected error occurred.'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Body */}
              <div className="p-5 space-y-4">
                <p className="text-slate-400 text-sm">
                  Your data is safe — this is a display error. Try recovering, or reload if it persists.
                </p>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={this.handleReset}
                    className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" /> Try Again
                  </button>
                  <button
                    onClick={this.handleHardReset}
                    className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-xl text-slate-300 font-medium transition-colors"
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
                      <div className="bg-slate-900/80 rounded-lg p-3 max-h-48 overflow-y-auto">
                        <pre className="text-rose-400/80 text-xs whitespace-pre-wrap break-all font-mono">
                          {this.state.error?.stack || 'No stack trace available'}
                        </pre>
                      </div>
                      {this.state.errorInfo?.componentStack && (
                        <div className="bg-slate-900/80 rounded-lg p-3 max-h-32 overflow-y-auto">
                          <p className="text-slate-500 text-xs mb-1">Component Stack:</p>
                          <pre className="text-slate-400 text-xs whitespace-pre-wrap break-all font-mono">
                            {this.state.errorInfo.componentStack}
                          </pre>
                        </div>
                      )}
                      <button
                        onClick={this.handleCopyError}
                        className="flex items-center gap-1 text-slate-500 hover:text-slate-300 text-xs transition-colors"
                      >
                        <Copy className="w-3 h-3" /> {this.state.copied ? 'Copied!' : 'Copy error for debugging'}
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
