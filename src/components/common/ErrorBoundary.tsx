import React, { Component, ErrorInfo, ReactNode } from "react";
import { Heart, RotateCcw, Home, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("OneCare uncaught client error:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = "/";
  };

  private toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col bg-background text-foreground">
          {/* Minimal OneCare Brand Bar */}
          <header className="w-full border-b border-border/40 bg-background/95 backdrop-blur px-6 py-4 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 focus-visible:outline-none">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Heart className="h-5 w-5 fill-current" />
              </div>
              <span className="font-display text-xl font-bold tracking-tight">OneCare</span>
            </a>
            <span className="text-xs text-muted-foreground font-medium">System Notice</span>
          </header>

          {/* Error Card */}
          <main className="flex-1 flex items-center justify-center p-6">
            <div className="w-full max-w-lg text-center space-y-6">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <AlertCircle className="h-7 w-7" />
              </div>

              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Something didn’t load properly
                </h1>
                <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                  We encountered an unexpected issue while displaying this page. Your health data and clinical records remain secure and unchanged.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
                >
                  <RotateCcw className="h-4 w-4" />
                  Try refreshing
                </button>
                <button
                  type="button"
                  onClick={this.handleGoHome}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted transition-colors"
                >
                  <Home className="h-4 w-4" />
                  Return to Home
                </button>
              </div>

              {/* Expandable Technical Details (Collapsible for developers/debuggers) */}
              {this.state.error && (
                <div className="pt-4 text-left">
                  <button
                    type="button"
                    onClick={this.toggleDetails}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mx-auto"
                  >
                    <span>{this.state.showDetails ? "Hide" : "Show"} diagnostic information</span>
                    {this.state.showDetails ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>

                  {this.state.showDetails && (
                    <div className="mt-3 p-3.5 rounded-lg border border-border/60 bg-muted/50 font-mono text-xs text-muted-foreground overflow-auto max-h-48 text-left">
                      <p className="font-semibold text-destructive mb-1">
                        {this.state.error.name}: {this.state.error.message}
                      </p>
                      {this.state.errorInfo?.componentStack && (
                        <pre className="whitespace-pre-wrap text-[11px] leading-relaxed opacity-80">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Need urgent medical assistance? Contact your local emergency services or healthcare provider directly.
              </p>
            </div>
          </main>
        </div>
      );
    }

    return this.props.children;
  }
}
