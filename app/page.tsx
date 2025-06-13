'use client';

import Image from "next/image";
import Link from "next/link";
import { FaGithub } from "react-icons/fa"; // Import GitHub icon from react-icons
import { useEffect } from "react";
import { useLoading } from "./components/LoadingProvider";

export default function Home() {
  const { hideLoading } = useLoading();

  useEffect(() => {
    // Hide loading once component is mounted
    hideLoading();
  }, [hideLoading]);
  return (
    <>
      <div className="grid grid-rows-[20px_1fr_20px] items-center justify-items-center min-h-screen p-8 pb-20 pt-24 gap-16 sm:p-20 sm:pt-28 font-[family-name:var(--font-geist-sans)]">
        <main className="flex flex-col gap-[32px] row-start-2 items-center sm:items-start">
  {/*         <Image
            className="dark:invert"
            src="/fsGazeLogo.svg"
            alt="fsgaze logo"
            width={180}
            height={38}
            priority
          /> */}
          <h5 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Welcome to functional safety Gaze (fsGaze)!
          </h5>

          <p className="text-left font-normal text-gray-700 dark:text-gray-400">
            fsGaze is a Proof of Concept platform that demonstrates modelling
            tool-independent safety visualization and automated safety checks. <br />
            By leveraging a graph database architecture, it provides a flexible
            foundation for implementing and extending safety verification
            capabilities.
          </p>

          <Image
            src="/SafetyGazeIntro.svg"
            alt="SafetyGaze Intro"
            className="h-auto w-4/5"
            width={800}
            height={600}
          />

          <div className="flex gap-4 items-center flex-col sm:flex-row">
            <Link
              href="/kerml-analyzer"
              className="rounded-full border border-solid border-transparent transition-colors flex items-center justify-center bg-foreground text-background gap-2 hover:bg-[#383838] dark:hover:bg-[#ccc] font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 sm:w-auto"
            >
              Upload SysML
            </Link>

            <Link
              href="/api-docs"
              className="rounded-full border border-solid border-black/[.08] dark:border-white/[.145] transition-colors flex items-center justify-center hover:bg-[#f2f2f2] dark:hover:bg-[#1a1a1a] hover:border-transparent font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 w-full sm:w-auto"
            >
              API Documentation
            </Link>
          </div>
        </main>
        <footer className="row-start-3 flex gap-[24px] flex-wrap items-center justify-center">
          <a
            className="flex items-center gap-2 hover:underline hover:underline-offset-4"
            href="https://github.com/cntSafety/fsGaze"
            target="_blank"
            rel="noopener noreferrer"
          >
            <FaGithub size={16} />
            GitHub Repository
          </a>
        </footer>
      </div>
    </>
  );
}
