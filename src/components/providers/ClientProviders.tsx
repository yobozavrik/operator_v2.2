'use client';

import dynamic from 'next/dynamic';
import React from 'react';

// Dynamically load AIChatAssistant only on the client side
const AIChatAssistant = dynamic(
  () => import('@/components/AIChatAssistant').then((mod) => mod.AIChatAssistant),
  { ssr: false }
);

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <AIChatAssistant />
    </>
  );
}
