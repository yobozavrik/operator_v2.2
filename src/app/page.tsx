'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BrainCircuit,
  Briefcase,
  ChevronRight,
  Factory,
  FlaskConical,
  Landmark,
  Megaphone,
  Network,
  ShieldAlert,
  Truck,
  Users,
  Wallet,
} from 'lucide-react';
import { Chakra_Petch, JetBrains_Mono } from 'next/font/google';
import { cn } from '@/lib/utils';
import { authedFetcher } from '@/lib/authed-fetcher';

const fetcher = authedFetcher;

const chakra = Chakra_Petch({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-chakra',
});

const jetbrains = JetBrains_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
});

type SummaryResponse = {
  fill_index?: number;
};

type MetricsResponse = {
  criticalSKU?: number;
  shopLoad?: number;
  totalSKU?: number;
};

const UI = {
  badge: '\u0420\u043e\u043b\u044c\u043e\u0432\u0438\u0439 \u0446\u0435\u043d\u0442\u0440 \u043a\u0435\u0440\u0443\u0432\u0430\u043d\u043d\u044f',
  title: '\u0412\u0438\u0440\u043e\u0431\u043d\u0438\u0447\u0438\u0439 \u0446\u0435\u043d\u0442\u0440',
  description:
    '\u0413\u043e\u043b\u043e\u0432\u043d\u0438\u0439 \u0432\u0445\u0456\u0434 \u0432 ERP: \u0441\u043f\u043e\u0447\u0430\u0442\u043a\u0443 \u0440\u043e\u043b\u044c \u0456 \u0443\u043f\u0440\u0430\u0432\u043b\u0456\u043d\u0441\u044c\u043a\u0438\u0439 \u043a\u043e\u043d\u0442\u0435\u043a\u0441\u0442, \u043f\u043e\u0442\u0456\u043c \u0446\u0435\u0445, \u0430\u043d\u0430\u043b\u0456\u0442\u0438\u043a\u0430 \u0442\u0430 \u0434\u0456\u0457.',
  roleSection: '\u0420\u043e\u0431\u043e\u0447\u0456 \u0432\u0445\u043e\u0434\u0438 \u0437\u0430 \u0440\u043e\u043b\u044f\u043c\u0438',
  roleSectionNote:
    '\u041e\u0441\u043d\u043e\u0432\u043d\u0456 \u0440\u0435\u0436\u0438\u043c\u0438 \u0434\u043b\u044f \u0443\u043f\u0440\u0430\u0432\u043b\u0456\u043d\u043d\u044f \u043c\u0435\u0440\u0435\u0436\u0435\u044e, \u0432\u0438\u0440\u043e\u0431\u043d\u0438\u0446\u0442\u0432\u043e\u043c \u0442\u0430 \u0444\u0443\u043d\u043a\u0446\u0456\u044f\u043c\u0438 \u043f\u0456\u0434\u0442\u0440\u0438\u043c\u043a\u0438.',
  workshopSection: '\u0421\u0442\u0430\u043d \u043c\u0435\u0440\u0435\u0436\u0456 \u0442\u0430 \u0446\u0435\u0445\u0456\u0432',
  workshopNote:
    '\u0426\u0435\u0445\u0438 \u0437\u0430\u043b\u0438\u0448\u0430\u044e\u0442\u044c\u0441\u044f \u0440\u0456\u0432\u043d\u0435\u043c \u0434\u0435\u0442\u0430\u043b\u0456\u0437\u0430\u0446\u0456\u0457, \u0430 \u043d\u0435 \u0433\u043e\u043b\u043e\u0432\u043d\u0438\u043c \u0432\u0445\u043e\u0434\u043e\u043c \u0443 \u0441\u0438\u0441\u0442\u0435\u043c\u0443.',
  quickSection: '\u0428\u0432\u0438\u0434\u043a\u0456 \u043f\u0435\u0440\u0435\u0445\u043e\u0434\u0438',
  quickNote:
    '\u0421\u0435\u0440\u0432\u0456\u0441\u043d\u0456 \u0442\u0430 \u0441\u043f\u0435\u0446\u0456\u0430\u043b\u0456\u0437\u043e\u0432\u0430\u043d\u0456 \u043c\u043e\u0434\u0443\u043b\u0456.',
};

export default function HomePage() {
  const { data: graviton } = useSWR<MetricsResponse>('/api/graviton/metrics', fetcher, {
    refreshInterval: 30000,
  });
  const { data: pizza } = useSWR<SummaryResponse>('/api/pizza/summary', fetcher, {
    refreshInterval: 60000,
  });
  const { data: konditerka } = useSWR<SummaryResponse>('/api/konditerka/summary', fetcher, {
    refreshInterval: 60000,
  });
  const { data: bulvar } = useSWR<SummaryResponse>('/api/bulvar/summary', fetcher, {
    refreshInterval: 60000,
  });
  const { data: sadova } = useSWR<MetricsResponse>('/api/sadova/metrics', fetcher, {
    refreshInterval: 60000,
  });

  const workshops = [
    {
      name: '\u0413\u0440\u0430\u0432\u0456\u0442\u043e\u043d',
      href: '/graviton',
      status: (graviton?.criticalSKU || 0) > 0 ? 'critical' : 'stable',
      note: `${graviton?.criticalSKU || 0} \u043a\u0440\u0438\u0442\u0438\u0447\u043d\u0438\u0445 \u043f\u043e\u0437\u0438\u0446\u0456\u0439`,
    },
    {
      name: '\u041f\u0456\u0446\u0430',
      href: '/pizza',
      status: (pizza?.fill_index || 0) >= 100 ? 'stable' : 'risk',
      note: `\u0420\u0456\u0432\u0435\u043d\u044c \u043f\u043e\u043a\u0440\u0438\u0442\u0442\u044f ${Math.round(pizza?.fill_index || 0)}%`,
    },
    {
      name: '\u041a\u043e\u043d\u0434\u0438\u0442\u0435\u0440\u043a\u0430',
      href: '/konditerka',
      status: (konditerka?.fill_index || 0) >= 100 ? 'stable' : 'risk',
      note: `\u0420\u0456\u0432\u0435\u043d\u044c \u043f\u043e\u043a\u0440\u0438\u0442\u0442\u044f ${Math.round(konditerka?.fill_index || 0)}%`,
    },
    {
      name: '\u0411\u0443\u043b\u044c\u0432\u0430\u0440',
      href: '/bulvar',
      status: (bulvar?.fill_index || 0) >= 100 ? 'stable' : 'risk',
      note: `\u0420\u0456\u0432\u0435\u043d\u044c \u043f\u043e\u043a\u0440\u0438\u0442\u0442\u044f ${Math.round(bulvar?.fill_index || 0)}%`,
    },
    {
      name: '\u0421\u0430\u0434\u043e\u0432\u0430',
      href: '/sadova',
      status: 'stable',
      note: sadova?.totalSKU 
        ? `${sadova.totalSKU} \u043f\u043e\u0437\u0438\u0446\u0456\u0439 \u0440\u043e\u0437\u043f\u043e\u0434\u0456\u043b\u0443` 
        : '\u0412\u0438\u0440\u043e\u0431\u043d\u0438\u0447\u0438\u0439 \u043a\u043e\u043d\u0442\u0443\u0440',
    },
  ];

  const criticalItems = [
    {
      title: '\u0414\u0435\u0444\u0456\u0446\u0438\u0442\u0438 \u043c\u0435\u0440\u0435\u0436\u0456',
      value: `${graviton?.criticalSKU || 0} \u043f\u043e\u0437.`,
      note: '\u041a\u043b\u044e\u0447\u043e\u0432\u0438\u0439 \u0441\u0438\u0433\u043d\u0430\u043b \u0434\u043b\u044f \u043e\u043f\u0435\u0440\u0430\u0446\u0456\u0439\u043d\u043e\u0433\u043e \u0440\u0456\u0448\u0435\u043d\u043d\u044f',
      tone: (graviton?.criticalSKU || 0) > 0 ? 'critical' : 'stable',
    },
    {
      title: '\u041d\u0430\u0432\u0430\u043d\u0442\u0430\u0436\u0435\u043d\u043d\u044f \u0432\u0438\u0440\u043e\u0431\u043d\u0438\u0446\u0442\u0432\u0430',
      value: `${Math.round(graviton?.shopLoad || 0)} \u043a\u0433`,
      note: '\u041f\u043e\u0442\u043e\u0447\u043d\u0438\u0439 \u043e\u0431\u0441\u044f\u0433 \u0434\u043e \u0432\u0438\u043f\u0443\u0441\u043a\u0443 / \u043f\u0435\u0440\u0435\u0440\u043e\u0431\u043a\u0438',
      tone: 'neutral',
    },
    {
      title: '\u041f\u0440\u043e\u0433\u043d\u043e\u0437 \u0456 \u0441\u0446\u0435\u043d\u0430\u0440\u0456\u0457',
      value: 'ML-\u043c\u043e\u0434\u0443\u043b\u044c',
      note: '\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u0438\u0439 \u0441\u0446\u0435\u043d\u0430\u0440\u043d\u0438\u0439 \u0430\u043d\u0430\u043b\u0456\u0437 \u0456 \u043f\u043b\u0430\u043d\u0443\u0432\u0430\u043d\u043d\u044f',
      tone: 'neutral',
    },
  ];

  const roles = [
    {
      href: '/owner',
      icon: Briefcase,
      title: '\u0412\u043b\u0430\u0441\u043d\u0438\u043a',
      subtitle: '\u041a\u043e\u043d\u0442\u0443\u0440 \u0432\u043b\u0430\u0441\u043d\u0438\u043a\u0430',
      bullets: [
        '\u041f\u043b\u0430\u043d / \u0444\u0430\u043a\u0442 \u0456 \u0444\u0456\u043d\u0430\u043d\u0441\u043e\u0432\u0435 \u0437\u0434\u043e\u0440\u043e\u0432\u2019\u044f',
        '\u0420\u0438\u0437\u0438\u043a\u0438 \u043f\u043e \u043c\u0435\u0440\u0435\u0436\u0456 \u0442\u0430 \u0446\u0435\u0445\u0430\u0445',
        '\u041f\u0440\u043e\u0433\u043d\u043e\u0437, \u0441\u0446\u0435\u043d\u0430\u0440\u0456\u0457, \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0438\u0432\u043d\u0456\u0441\u0442\u044c',
      ],
      accent: 'emerald' as const,
    },
    {
      href: '/ops',
      icon: ShieldAlert,
      title: '\u041e\u043f\u0435\u0440\u0430\u0446\u0456\u0439\u043d\u0438\u0439 \u0434\u0438\u0440\u0435\u043a\u0442\u043e\u0440',
      subtitle: '\u041e\u043f\u0435\u0440\u0430\u0446\u0456\u0439\u043d\u0438\u0439 \u043a\u043e\u043d\u0442\u0443\u0440',
      bullets: [
        '\u041a\u0440\u0438\u0442\u0438\u0447\u043d\u0456 \u0432\u0456\u0434\u0445\u0438\u043b\u0435\u043d\u043d\u044f \u0441\u044c\u043e\u0433\u043e\u0434\u043d\u0456',
        '\u0414\u0435\u0444\u0456\u0446\u0438\u0442\u0438 \u0439 \u0432\u0443\u0437\u044c\u043a\u0456 \u043c\u0456\u0441\u0446\u044f',
        '\u0420\u0456\u0448\u0435\u043d\u043d\u044f \u043f\u043e \u043c\u0435\u0440\u0435\u0436\u0456 \u0442\u0430 \u0446\u0435\u0445\u0430\u0445',
      ],
      accent: 'blue' as const,
      inDevelopment: true,
    },
    {
      href: '/production-chief',
      icon: Factory,
      title: '\u041d\u0430\u0447\u0430\u043b\u044c\u043d\u0438\u043a \u0432\u0438\u0440\u043e\u0431\u043d\u0438\u0446\u0442\u0432\u0430',
      subtitle: '\u041a\u043e\u043d\u0442\u0443\u0440 \u0437\u043c\u0456\u043d\u0438',
      bullets: [
        '\u0427\u0435\u0440\u0433\u0430 \u043d\u0430 \u0437\u043c\u0456\u043d\u0443 \u0442\u0430 \u043f\u0440\u0456\u043e\u0440\u0438\u0442\u0435\u0442\u0438',
        '\u0411\u043b\u043e\u043a\u0435\u0440\u0438 \u0439 \u0433\u043e\u0442\u043e\u0432\u043d\u0456\u0441\u0442\u044c',
        '\u0428\u0432\u0438\u0434\u043a\u0438\u0439 \u043f\u0435\u0440\u0435\u0445\u0456\u0434 \u0434\u043e \u0432\u0438\u043a\u043e\u043d\u0430\u043d\u043d\u044f',
      ],
      accent: 'amber' as const,
    },
    {
      href: '/supply-chief',
      icon: Truck,
      title: '\u041d\u0430\u0447\u0430\u043b\u044c\u043d\u0438\u043a \u043f\u043e\u0441\u0442\u0430\u0447\u0430\u043d\u043d\u044f',
      subtitle: '\u041b\u043e\u0433\u0456\u0441\u0442\u0438\u0447\u043d\u0438\u0439 \u043a\u043e\u043d\u0442\u0443\u0440',
      bullets: [
        '\u041a\u0435\u0440\u0443\u0432\u0430\u043d\u043d\u044f \u0437\u0430\u043a\u0443\u043f\u0456\u0432\u043b\u044f\u043c\u0438 \u0441\u0438\u0440\u043e\u0432\u0438\u043d\u0438',
        '\u041c\u043e\u043d\u0456\u0442\u043e\u0440\u0438\u043d\u0433 \u0437\u0430\u043b\u0438\u0448\u043a\u0456\u0432 \u043d\u0430 \u0441\u043a\u043b\u0430\u0434\u0430\u0445',
        '\u041e\u043f\u0442\u0438\u043c\u0456\u0437\u0430\u0446\u0456\u044f \u043b\u043e\u0433\u0456\u0441\u0442\u0438\u0447\u043d\u0438\u0445 \u043b\u0430\u043d\u0446\u044e\u0433\u0456\u0432',
      ],
      accent: 'blue' as const,
    },
    {
      href: '/hr',
      icon: Users,
      title: '\u0412\u0456\u0434\u0434\u0456\u043b \u043a\u0430\u0434\u0440\u0456\u0432',
      subtitle: '\u041f\u0435\u0440\u0441\u043e\u043d\u0430\u043b \u0442\u0430 KPI',
      bullets: [
        '\u0423\u043f\u0440\u0430\u0432\u043b\u0456\u043d\u043d\u044f \u0433\u0440\u0430\u0444\u0456\u043a\u0430\u043c\u0438 \u0437\u043c\u0456\u043d',
        '\u041e\u0431\u043b\u0456\u043a \u0440\u043e\u0431\u043e\u0447\u043e\u0433\u043e \u0447\u0430\u0441\u0443 \u0442\u0430 KPI',
        '\u041d\u0430\u0439\u043c \u0442\u0430 \u0430\u0434\u0430\u043f\u0442\u0430\u0446\u0456\u044f \u043f\u0435\u0440\u0441\u043e\u043d\u0430\u043b\u0443',
      ],
      accent: 'emerald' as const,
    },
    {
      href: '/finance',
      icon: Landmark,
      title: '\u0424\u0456\u043d\u0430\u043d\u0441\u043e\u0432\u0438\u0439 \u0434\u0438\u0440\u0435\u043a\u0442\u043e\u0440',
      subtitle: '\u0424\u0456\u043d\u0430\u043d\u0441\u043e\u0432\u0438\u0439 \u043a\u043e\u043d\u0442\u0443\u0440',
      bullets: [
        '\u0410\u043d\u0430\u043b\u0456\u0437 \u0441\u043e\u0431\u0456\u0432\u0430\u0440\u0442\u043e\u0441\u0442\u0456 \u0442\u0430 \u043c\u0430\u0440\u0436\u0456',
        '\u041a\u043e\u043d\u0442\u0440\u043e\u043b\u044c \u043e\u043f\u0435\u0440\u0430\u0446\u0456\u0439\u043d\u0438\u0445 \u0432\u0438\u0442\u0440\u0430\u0442',
        '\u0424\u0456\u043d\u0430\u043d\u0441\u043e\u0432\u0435 \u043f\u043b\u0430\u043d\u0443\u0432\u0430\u043d\u043d\u044f',
      ],
      accent: 'amber' as const,
    },
    {
      href: '#',
      icon: Megaphone,
      title: '\u041c\u0430\u0440\u043a\u0435\u0442\u0438\u043d\u0433',
      subtitle: '\u041a\u043e\u043c\u0435\u0440\u0446\u0456\u0439\u043d\u0438\u0439 \u043a\u043e\u043d\u0442\u0443\u0440',
      bullets: [
        '\u0410\u043d\u0430\u043b\u0456\u0437 \u0441\u043f\u043e\u0436\u0438\u0432\u0447\u043e\u0433\u043e \u043f\u043e\u043f\u0438\u0442\u0443',
        '\u0423\u043f\u0440\u0430\u0432\u043b\u0456\u043d\u043d\u044f \u043f\u0440\u043e\u0433\u0440\u0430\u043c\u0430\u043c\u0438 \u043b\u043e\u044f\u043b\u044c\u043d\u043e\u0441\u0442\u0456',
        '\u041a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0446\u0456\u044f \u0437\u0430\u043f\u0443\u0441\u043a\u0456\u0432 \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0456\u0432',
      ],
      accent: 'blue' as const,
      inDevelopment: true,
    },
    {
      href: '#',
      icon: FlaskConical,
      title: '\u0413\u043e\u043b\u043e\u0432\u043d\u0438\u0439 \u0442\u0435\u0445\u043d\u043e\u043b\u043e\u0433',
      subtitle: '\u042f\u043a\u0456\u0441\u0442\u044c \u0442\u0430 \u0440\u0435\u0446\u0435\u043f\u0442\u0443\u0440\u0438',
      bullets: [
        '\u0420\u043e\u0437\u0440\u043e\u0431\u043a\u0430 \u043d\u043e\u0432\u0438\u0445 \u0440\u0435\u0446\u0435\u043f\u0442\u0443\u0440',
        '\u041a\u043e\u043d\u0442\u0440\u043e\u043b\u044c \u044f\u043a\u043e\u0441\u0442\u0456 \u043f\u0440\u043e\u0434\u0443\u043a\u0446\u0456\u0457',
        '\u0421\u0442\u0430\u043d\u0434\u0430\u0440\u0442\u0438\u0437\u0430\u0446\u0456\u044f \u0442\u0435\u0445\u043f\u0440\u043e\u0446\u0435\u0441\u0456\u0432',
      ],
      accent: 'emerald' as const,
      inDevelopment: true,
    },
  ];

  const quickLinks = [
    {
      href: '/finance',
      icon: Wallet,
      title: '\u0424\u0456\u043d\u0430\u043d\u0441\u0438',
      note: '\u041c\u0430\u0440\u0436\u0430, \u0432\u0438\u0442\u043e\u0440\u0433, \u0432\u0456\u0434\u0445\u0438\u043b\u0435\u043d\u043d\u044f',
    },
    {
      href: '/forecasting',
      icon: BrainCircuit,
      title: '\u041f\u0440\u043e\u0433\u043d\u043e\u0437\u0443\u0432\u0430\u043d\u043d\u044f',
      note: 'ML-\u0441\u0446\u0435\u043d\u0430\u0440\u0456\u0457 \u0442\u0430 \u043f\u043b\u0430\u043d\u0443\u0432\u0430\u043d\u043d\u044f',
    },
    {
      href: '/production',
      icon: AlertTriangle,
      title: '\u0412\u0438\u0440\u043e\u0431\u043d\u0438\u0447\u0438\u0439 \u043a\u043e\u043d\u0442\u0443\u0440',
      note: '\u0427\u0435\u0440\u0433\u0430, \u043f\u0440\u0456\u043e\u0440\u0438\u0442\u0435\u0442\u0438, \u0434\u0456\u0457',
    },
    {
      href: '/bakery',
      icon: BarChart3,
      title: '\u041f\u0435\u043a\u0430\u0440\u043d\u044f / \u0430\u043d\u0430\u043b\u0456\u0442\u0438\u043a\u0430',
      note: '\u041e\u043a\u0440\u0435\u043c\u0438\u0439 \u0430\u043d\u0430\u043b\u0456\u0442\u0438\u0447\u043d\u0438\u0439 \u043c\u043e\u0434\u0443\u043b\u044c',
    },
  ];

  return (
    <div
      className={cn(
        'min-h-screen bg-[radial-gradient(circle_at_top,_#f8fafc,_#eef4ff_45%,_#f8fafc)] text-slate-900',
        chakra.variable,
        jetbrains.variable,
        'font-[family-name:var(--font-chakra)]',
      )}
    >
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col px-4 py-6 md:px-8 md:py-8">
        <header className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-blue-700 font-[family-name:var(--font-jetbrains)]">
                <Network size={14} />
                {UI.badge}
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950 md:text-5xl">
                {UI.title}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
                {UI.description}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[560px]">
              {criticalItems.map((item) => (
                <div
                  key={item.title}
                  className={cn(
                    'rounded-2xl border p-4',
                    item.tone === 'critical' && 'border-red-200 bg-red-50',
                    item.tone === 'stable' && 'border-emerald-200 bg-emerald-50',
                    item.tone === 'neutral' && 'border-slate-200 bg-slate-50',
                  )}
                >
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500 font-[family-name:var(--font-jetbrains)]">
                    {item.title}
                  </div>
                  <div className="mt-2 text-2xl font-bold text-slate-950">{item.value}</div>
                  <div className="mt-1 text-xs text-slate-600">{item.note}</div>
                </div>
              ))}
            </div>
          </div>
        </header>

        <section className="mb-8">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-950 md:text-2xl">{UI.roleSection}</h2>
            <p className="mt-1 text-sm text-slate-600">{UI.roleSectionNote}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {roles.map((role) => (
              <RoleCard key={role.title} {...role} />
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <div className="mb-5 flex items-center gap-3">
              <BarChart3 className="text-blue-600" size={20} />
              <div>
                <h3 className="text-lg font-bold text-slate-950">{UI.workshopSection}</h3>
                <p className="text-sm text-slate-600">{UI.workshopNote}</p>
              </div>
            </div>

            <div className="space-y-3">
              {workshops.map((workshop) => (
                <Link
                  key={workshop.name}
                  href={workshop.href}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-slate-300 hover:bg-slate-100"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'h-2.5 w-2.5 rounded-full',
                        workshop.status === 'critical' && 'bg-red-500',
                        workshop.status === 'risk' && 'bg-amber-500',
                        workshop.status === 'stable' && 'bg-emerald-500',
                      )}
                    />
                    <div>
                      <div className="font-semibold text-slate-900">{workshop.name}</div>
                      <div className="text-xs text-slate-600">{workshop.note}</div>
                    </div>
                  </div>
                  <ChevronRight className="text-slate-400" size={18} />
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <div className="mb-5 flex items-center gap-3">
              <BrainCircuit className="text-emerald-600" size={20} />
              <div>
                <h3 className="text-lg font-bold text-slate-950">{UI.quickSection}</h3>
                <p className="text-sm text-slate-600">{UI.quickNote}</p>
              </div>
            </div>

            <div className="space-y-3">
              {quickLinks.map((link) => (
                <QuickLink key={link.title} {...link} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function RoleCard({
  href,
  icon: Icon,
  title,
  subtitle,
  bullets,
  accent,
  inDevelopment = false,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  subtitle: string;
  bullets: string[];
  accent: 'emerald' | 'blue' | 'amber';
  inDevelopment?: boolean;
}) {
  const accentClass = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
  }[accent];

  const cardClass = cn(
    'group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition',
    inDevelopment
      ? 'cursor-not-allowed'
      : 'hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md',
  );

  const content = (
    <>
      {inDevelopment && (
        <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
          <div className="rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-center">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-700">В розробці</div>
          </div>
        </div>
      )}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className={cn('rounded-2xl border p-3', accentClass)}>
          <Icon size={22} />
        </div>
        <ArrowRight className={cn('text-slate-300 transition', !inDevelopment && 'group-hover:translate-x-0.5 group-hover:text-slate-500')} />
      </div>

      <div className="text-center text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{subtitle}</div>
      <div className="mt-2 text-center text-xl font-bold text-slate-950">{title}</div>

      <ul className="mt-4 space-y-2">
        {bullets.map((bullet) => (
          <li key={bullet} className="text-sm leading-6 text-slate-600">
            {bullet}
          </li>
        ))}
      </ul>
    </>
  );

  if (inDevelopment) {
    return (
      <div className={cardClass} aria-disabled="true">
        {content}
      </div>
    );
  }

  return (
    <Link href={href} className={cardClass}>
      {content}
    </Link>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  note,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  note: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-slate-300 hover:bg-slate-100"
    >
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700">
          <Icon size={18} />
        </div>
        <div>
          <div className="font-semibold text-slate-950">{title}</div>
          <div className="text-xs text-slate-600">{note}</div>
        </div>
      </div>
      <ChevronRight size={18} className="text-slate-400" />
    </Link>
  );
}
