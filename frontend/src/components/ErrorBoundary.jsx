import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: error?.message || 'Unexpected UI error occurred.',
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[UI ErrorBoundary]', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, message: '' });
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="page" style={{ display: 'flex', justifyContent: 'center', padding: '5rem 1rem' }}>
        <div className="card" style={{ maxWidth: 520, width: '100%', textAlign: 'center' }}>
          <div style={{ fontWeight: 800, fontSize: '1.2rem', marginBottom: '0.5rem' }}>Something went wrong</div>
          <div style={{ color: 'var(--text-secondary)', marginBottom: '1.1rem' }}>
            {this.state.message}
          </div>
          <button className="btn btn-primary" onClick={this.handleReload}>Reload App</button>
        </div>
      </div>
    );
  }
}
