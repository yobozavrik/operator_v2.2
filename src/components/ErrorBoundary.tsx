'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            if (this.fallback) return this.fallback;

            return (
                <div className="flex flex-col items-center justify-center p-8 bg-[#252526] rounded border border-[#e74856]/30 text-center gap-4 h-full">
                    <AlertCircle className="text-[#e74856]" size={32} />
                    <div className="flex flex-col gap-1">
                        <h3 className="text-white font-bold text-[14px] uppercase tracking-wider">Component Error</h3>
                        <p className="text-slate-400 text-[11px] max-w-[200px]">
                            Critical error during data visualization or rendering.
                        </p>
                    </div>
                    <button
                        onClick={() => this.setState({ hasError: false })}
                        className="flex items-center gap-2 px-4 py-2 bg-[#e74856]/10 hover:bg-[#e74856]/20 text-[#e74856] text-[11px] font-bold rounded border border-[#e74856]/20 transition-all"
                    >
                        <RefreshCw size={12} />
                        RETRY COMPONENT
                    </button>
                </div>
            );
        }

        return this.children;
    }

    private get children() {
        return this.props.children;
    }

    private get fallback() {
        return this.props.fallback;
    }
}
