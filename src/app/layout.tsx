import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/context/StoreContext";
import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/components/theme-provider";
import { ClientProviders } from "@/components/providers/ClientProviders";
import { SWRProvider } from "@/components/providers/SWRProvider";
import { geistSans, jetbrains } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "Graviton | Аналітична система",
  description: "Інтелектуальний дашборд для керівника",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk" suppressHydrationWarning className={`${geistSans.variable} ${jetbrains.variable}`}>
      <body
        suppressHydrationWarning
        className="antialiased font-sans bg-bg-primary text-text-primary transition-colors duration-300"
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="bg-noise opacity-10 pointer-events-none fixed inset-0 z-50" />
          <SWRProvider>
            <StoreProvider>
              <ToastProvider>
                <ClientProviders>
                  {children}
                </ClientProviders>
              </ToastProvider>
            </StoreProvider>
          </SWRProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
