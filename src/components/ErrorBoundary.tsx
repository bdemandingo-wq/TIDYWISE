import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/lib/supabase';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onRetry?: () => void;
  featureName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Global Error Boundary - wraps features to catch render errors
 * Logs all caught errors to system_logs table for debugging
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  async componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    
    // Log error to console in development
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Log to system_logs table
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Get organization_id from org_memberships
      let organizationId: string | null = null;
      if (user?.id) {
        const { data: membership } = await supabase
          .from('org_memberships')
          .select('organization_id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle();
        organizationId = membership?.organization_id || null;
      }

      await supabase.from('system_logs').insert({
        level: 'error',
        source: `ErrorBoundary:${this.props.featureName || 'Unknown'}`,
        message: error.message || 'Unknown error',
        details: {
          featureName: this.props.featureName,
          componentStack: errorInfo.componentStack,
          errorName: error.name,
          url: window.location.href,
        },
        user_id: user?.id || null,
        organization_id: organizationId,
        stack_trace: error.stack || null,
      });
    } catch (logError) {
      // Don't fail if logging fails - just log to console
      console.error('Failed to log error to system_logs:', logError);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.props.onRetry?.();
  };

  handleGoHome = () => {
    window.location.href = '/dashboard';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center min-h-[400px] p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <CardTitle>Something went wrong</CardTitle>
              <CardDescription>
                {this.props.featureName 
                  ? `There was a problem loading ${this.props.featureName}.`
                  : 'An unexpected error occurred.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-muted rounded-lg p-3 text-sm text-muted-foreground">
                <p className="font-medium mb-1">Error details:</p>
                <p className="font-mono text-xs break-all">
                  {this.state.error?.message || 'Unknown error'}
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex gap-2 justify-center">
              <Button variant="outline" onClick={this.handleGoHome}>
                <Home className="h-4 w-4 mr-2" />
                Go to Dashboard
              </Button>
              <Button onClick={this.handleRetry}>
                <RefreshCcw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// Hook for functional components to trigger error boundary
export function useErrorHandler() {
  const [, setError] = React.useState<Error | null>(null);

  return React.useCallback((error: Error) => {
    setError(() => {
      throw error;
    });
  }, []);
}
