import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Top-level React Error Boundary preventing unhandled render crashes across portals.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
  };

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return {
      hasError: true,
    };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Uncaught UI error:', error, info.componentStack);
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="min-h-screen flex items-center justify-center p-6 bg-[#f8f4e2] text-[#272727]"
        >
          <div className="max-w-md w-full bg-card p-8 rounded-2xl border-2 border-foreground/20 text-center space-y-4 shadow-md">
            <p className="text-xs font-bold uppercase tracking-widest text-terracotta">CircleUp</p>
            <h2 className="font-display text-2xl sm:text-3xl text-forest-deep">
              Something went wrong
            </h2>
            <p className="text-sm text-foreground/75">
              Something went wrong. Please try again.
            </p>
            <div className="pt-2 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-full bg-forest-deep px-5 py-2 text-xs font-bold text-white hover:bg-forest transition-colors"
              >
                Try Again
              </button>
              <a
                href="/"
                className="rounded-full border border-forest/30 px-5 py-2 text-xs font-bold text-forest hover:bg-forest/5 transition-colors"
              >
                Go Home
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

