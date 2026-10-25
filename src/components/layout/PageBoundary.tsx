import { Component, type ReactNode } from 'react';

export class PageBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed)
      return (
        <section role="alert">
          <h1>This page couldn’t be opened.</h1>
          <p>Refresh the app to try again.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Refresh app
          </button>
        </section>
      );
    return this.props.children;
  }
}
