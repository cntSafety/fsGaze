import type { Metadata } from "next";
import { Navbar } from "./components/Navbar";
import { LoadingProvider } from "./components/LoadingProvider";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import 'antd/dist/reset.css';
import '@ant-design/v5-patch-for-react-19';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "fsGaze",
  description: "functional safety Gaze - safety visualisation and automation based on SysML-v2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Script to prevent flash of unstyled content */}
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
              } else {
                document.documentElement.classList.remove('dark');
              }
            })()
          `
        }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gray-100 dark:bg-gray-900 flex h-screen overflow-hidden`}
      >
        <LoadingProvider>
          <div className="flex w-full h-full">
            <Navbar />
            <main className="flex-1 overflow-auto bg-white dark:bg-gray-900 dark:text-white md:ml-10 md:pl-0 pl-0 pt-16 md:pt-0">
              <div className="w-full h-full px-2 py-2 sm:px-4">
                {children}
              </div>
            </main>
          </div>
        </LoadingProvider>
      </body>
    </html>
  );
}
