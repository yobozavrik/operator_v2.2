import { Geist, JetBrains_Mono, Chakra_Petch } from "next/font/google";

export const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: 'swap',
});

export const jetbrains = JetBrains_Mono({
  weight: ['400', '700'],
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: 'swap',
});

export const chakra = Chakra_Petch({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-chakra',
});
