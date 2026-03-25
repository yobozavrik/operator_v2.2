import { Geist, JetBrains_Mono, Chakra_Petch } from "next/font/google";

export const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
  display: 'swap',
});

export const jetbrains = JetBrains_Mono({
  weight: ['400', '700'],
  subsets: ["latin", "cyrillic"],
  variable: "--font-jetbrains",
  display: 'swap',
});

export const chakra = Chakra_Petch({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ["latin"], // Chakra Petch does not have a cyrillic subset unfortunately 
  display: 'swap',
  variable: '--font-chakra',
});
