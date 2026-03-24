'use client';

import { notFound, useParams } from 'next/navigation';
import { ShiftScheduler } from '@/components/hr/ShiftScheduler';

const VALID_SECTIONS = ['schedule'] as const;
type HrSection = (typeof VALID_SECTIONS)[number];

export default function HrSectionPage() {
  const { section } = useParams<{ section: string }>();

  if (!VALID_SECTIONS.includes(section as HrSection)) {
    notFound();
  }

  if (section === 'schedule') {
    return <ShiftScheduler />;
  }

  notFound();
}
