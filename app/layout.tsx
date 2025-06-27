import type { Metadata } from "next";
import { Navbar } from "./components/Navbar";
import { LoadingProvider } from "./components/LoadingProvider";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import 'antd/dist/reset.css';
import '@ant-design/v5-patch-for-react-19';
import { ThemeProvider } from "./components/ThemeProvider";

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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <LoadingProvider>
            <Navbar>
              {children}
            </Navbar>
          </LoadingProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
