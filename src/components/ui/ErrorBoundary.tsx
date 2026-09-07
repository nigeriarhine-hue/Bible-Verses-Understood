import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Keeps one broken panel from taking the whole reading experience down. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unexpected error:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="container-page py-16">
        <div className="glass mx-auto max-w-lg p-6 text-center">
          <h1 className="display text-2xl">Something went wrong</h1>
          <p className="mt-3 text-ui-base muted">
            The page could not be displayed. Reloading usually clears it.
          </p>
          <button type="button" onClick={() => window.location.reload()} className="btn btn-primary mt-5">
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}
