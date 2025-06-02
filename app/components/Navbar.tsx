"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { HiHome, HiCloudDownload, HiChartBar, HiClipboardCheck, HiDocumentReport, HiMenuAlt2, HiChevronDown, HiLightningBolt, HiX, HiChevronLeft, HiChevronRight, HiOutlineDocumentReport, HiOutlineCode, HiFastForward    } from "react-icons/hi";
import { useState, useEffect } from "react";
import { IconType } from "react-icons";
import { useLoading } from "./LoadingProvider";

// Menu item types
type MenuItem = SimpleMenuItem | DropdownMenuItem;

interface SimpleMenuItem {
    type: 'link';
    label: string;
    href: string;
    icon: IconType;
}

interface DropdownMenuItem {
    type: 'dropdown';
    label: string;
    icon: IconType;
    items: {
        label: string;
        href: string;
        isActive?: boolean;
    }[];
}

export function Navbar() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [mounted, setMounted] = useState(false);
    const [activeMenuItem, setActiveMenuItem] = useState<string>('/');
    const router = useRouter();
    const { showLoading, hideLoading } = useLoading();

    // Initialize client-side state
    useEffect(() => {
        setMounted(true);
        // Restore sidebar collapsed state from localStorage
        const savedCollapsedState = localStorage.getItem('fsGaze-sidebar-collapsed');
        if (savedCollapsedState) {
            setIsSidebarCollapsed(JSON.parse(savedCollapsedState));
        }
    }, []);

    // Update active menu item based on URL
    useEffect(() => {
        if (typeof window !== 'undefined') {
            setActiveMenuItem(window.location.pathname);
        }
    }, []);

    // Centralized menu structure
    const menuItems: MenuItem[] = [
        {
            type: 'dropdown',
            label: 'Overview',
            icon: HiHome,
            items: [
                { label: 'Info Page', href: '/', isActive: true },
                { label: 'API fsGaze', href: '/api-docs', isActive: true }
            ]
        },
        {
            type: 'dropdown',
            label: 'Import',
            icon: HiCloudDownload,
            items: [ 
                { label: 'File Based', href: '/kerml-analyzer', isActive: true },
                { label: 'API Based', href: '/Import/apibased', isActive: false },
                { label: 'Sphinx-Needs', href: '/sphinx-needs-import', isActive: true }
            ]
        },
        {
            type: 'dropdown',
            label: 'ARXML',
            icon: HiOutlineCode , // You can use a different icon if desired
            items: [
                { label: 'ARXML Importer', href: '/arxml-importer', isActive: true },
                { label: 'SW Components', href: '/arxml-viewer', isActive: true }
            ]
        },
        {
            type: 'dropdown',
            label: 'Safety Views',
            icon: HiLightningBolt,
            items: [
                { label: 'Causal Chain Graph', href: '/causal-chain', isActive: true },
                { label: 'Causal Chain Flow', href: '/causal-chain-flow', isActive: true },
                { label: 'Add your own..', href: '/Analysis/detailed', isActive: false }
            ]
        },
        {
            type: 'dropdown',
            label: 'Safety Automation',
            icon: HiFastForward,
            items: [
                { label: 'Find shared signals for CCA', href: '/find-shared-signals', isActive: true },
                { label: 'Find inputs with too low integrity', href: '/fm/effects', isActive: false },
                { label: 'Find decomposition issues', href: '/Analysis/detailed', isActive: false },
                { label: 'Find not assigned Req, missing FM etc.', href: '/Analysis/detailed', isActive: false },
                { label: 'Find gaps Arch. vs Implementation..', href: '/Analysis/detailed', isActive: false },
                { label: 'Support for impact analysis', href: '/Analysis/detailed', isActive: false },
                { label: 'add your own...', href: '/Analysis/detailed', isActive: false },
            ]
        },
        {
            type: 'dropdown',
            label: 'Reports',
            icon: HiOutlineDocumentReport ,
            items: [
                { label: 'Statistic for TBC', href: '/find-shared-signals', isActive: true }
            ]
        },
    ];

    // Handle navigation with loading state
    const handleNavigation = (href: string, label: string) => {
        if (href === '#') return; // Skip inactive links
        
        // If sidebar is collapsed, expand it when navigating
        if (isSidebarCollapsed) {
            setIsSidebarCollapsed(false);
            localStorage.setItem('fsGaze-sidebar-collapsed', JSON.stringify(false));
        }
        
        showLoading(`Loading ${label}...`);
        setActiveMenuItem(href);
        setIsMenuOpen(false);
        
        // Use router.push for navigation
        router.push(href);
        
        // Hide loading after a short delay to account for compilation
        setTimeout(() => {
            hideLoading();
        }, 500);
    };

    const toggleGroup = (label: string) => {
        setExpandedGroups(prev => ({
            ...prev,
            [label]: !prev[label]
        }));
    };

    // Don't render until mounted to avoid hydration mismatch
    if (!mounted) {
        return null;
    }

    return (
        <div className="flex h-screen">
            {/* Sidebar - Desktop */}
            <div className={`hidden md:flex md:flex-col transition-all duration-300 ${
                isSidebarCollapsed ? 'md:w-16' : 'md:w-64'
            }`}>
                <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800">
                    {/* Logo area */}
                    <div className="h-16 flex items-center justify-center px-4 border-b border-gray-200 dark:border-gray-800">
                        {isSidebarCollapsed ? (
                            <div className="w-8 h-8 flex items-center justify-center">
                                <Image 
                                    src="/GazeIcon.png"
                                    alt="fsGaze Logo"
                                    width={20}
                                    height={20}
                                    className="w-full h-auto"
                                    priority
                                />
                            </div>
                        ) : (
                            <div className="flex items-center justify-center w-full">
                                <div className="w-[50%]">
                                    <Image 
                                        src="/LogoBlack.svg"
                                        alt="fsGaze Logo"
                                        width={150}
                                        height={40}
                                        className="w-full h-auto"
                                        priority
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Menu items */}
                    <div className="flex-1 overflow-y-auto py-4 px-3">
                        {menuItems.map((item, index) => {
                            const isActive = item.type === 'link'
                                ? activeMenuItem === item.href
                                : item.items.some(subitem => activeMenuItem === subitem.href);

                            return (
                                <div key={index} className="mb-2">
                                    {item.type === 'link' ? (
                                        <button
                                            onClick={() => handleNavigation(item.href, item.label)}
                                            className={`flex items-center px-4 py-2.5 text-sm rounded-lg transition-colors w-full text-left ${
                                                isActive
                                                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                                                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                                            } ${isSidebarCollapsed ? 'justify-center px-2' : ''}`}
                                            title={isSidebarCollapsed ? item.label : undefined}
                                        >
                                            <item.icon 
                                                className={`${isSidebarCollapsed ? 'size-6 mr-0' : 'size-5 mr-3'}`} 
                                            />
                                            {!isSidebarCollapsed && item.label}
                                        </button>
                                    ) : (
                                        <div className="mb-1">
                                            <button
                                                onClick={() => {
                                                    if (isSidebarCollapsed) {
                                                        // In collapsed mode, navigate to first active item
                                                        const firstActiveItem = item.items.find(subitem => subitem.isActive !== false);
                                                        if (firstActiveItem) {
                                                            handleNavigation(firstActiveItem.href, firstActiveItem.label);
                                                        }
                                                    } else {
                                                        toggleGroup(item.label);
                                                    }
                                                }}
                                                className={`flex w-full items-center ${isSidebarCollapsed ? 'justify-center px-2' : 'justify-between px-4'} py-2.5 text-sm rounded-lg transition-colors ${
                                                    isActive 
                                                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                                                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                                                }`}
                                                title={isSidebarCollapsed ? item.label : undefined}
                                            >
                                                <div className="flex items-center">
                                                    <item.icon 
                                                        className={`${isSidebarCollapsed ? 'size-6 mr-0' : 'size-5 mr-3'}`} 
                                                    />
                                                    {!isSidebarCollapsed && item.label}
                                                </div>
                                                {!isSidebarCollapsed && (
                                                    <HiChevronDown 
                                                        className={`size-4 transition-transform ${
                                                            expandedGroups[item.label] ? 'rotate-180' : ''
                                                        }`} 
                                                    />
                                                )}
                                            </button>
                                            
                                            {!isSidebarCollapsed && expandedGroups[item.label] && (
                                                <div className="mt-1 ml-6 pl-4 border-l border-gray-200 dark:border-gray-700">
                                                    {item.items.map((subitem, subIndex) => {
                                                        const isSubitemActive = activeMenuItem === subitem.href;
                                                        return (
                                                            <button
                                                                key={subIndex}
                                                                onClick={() => {
                                                                    if (subitem.isActive !== false) {
                                                                        handleNavigation(subitem.href, subitem.label);
                                                                    }
                                                                }}
                                                                disabled={subitem.isActive === false}
                                                                className={`flex items-center px-3 py-2 text-sm rounded-lg my-0.5 w-full text-left ${
                                                                    subitem.isActive === false
                                                                        ? 'text-gray-400 cursor-not-allowed'
                                                                        : isSubitemActive
                                                                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                                                                            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                                                                }`}
                                                            >
                                                                {subitem.label}
                                                                {subitem.isActive === false && (
                                                                    <span className="ml-2 text-xs text-gray-400">(soon)</span>
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Collapse/Expand button */}
                    <div className="border-t border-gray-200 dark:border-gray-800 p-3">
                        <button
                            onClick={() => {
                                const newCollapsedState = !isSidebarCollapsed;
                                setIsSidebarCollapsed(newCollapsedState);
                                // Save to localStorage
                                localStorage.setItem('fsGaze-sidebar-collapsed', JSON.stringify(newCollapsedState));
                            }}
                            className={`flex items-center justify-center w-full text-sm rounded-lg transition-colors text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 ${
                                isSidebarCollapsed ? 'px-2 py-3' : 'px-4 py-2.5'
                            }`}
                            title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                        >
                            {isSidebarCollapsed ? (
                                <HiChevronRight className="size-10" />
                            ) : (
                                <>
                                    <HiChevronLeft className="mr-3 size-5" />
                                    Collapse
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile menu button */}
            <div className="fixed top-0 left-0 right-0 z-50 flex h-16 md:hidden items-center justify-between bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4">
                <div className="flex items-center">
                    <div className="mr-2">
                        <Image 
                            src="/GazeIcon.png"
                            alt="fsGaze Logo"
                            width={20}
                            height={20}
                            className="size-5"
                        />
                    </div>
                    <span className="text-lg font-medium text-gray-800 dark:text-gray-200">fsGaze</span>
                </div>
                <button
                    className="rounded-md p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                    onClick={() => setIsMenuOpen(!isMenuOpen)}
                >
                    {isMenuOpen ? <HiX className="size-6" /> : <HiMenuAlt2 className="size-6" />}
                </button>
            </div>

            {/* Mobile sidebar */}
            <div 
                className={`fixed inset-y-0 left-0 z-40 w-72 transform bg-gray-50 dark:bg-gray-900 shadow-lg transition-transform duration-300 ease-in-out md:hidden ${
                    isMenuOpen ? 'translate-x-0' : '-translate-x-full'
                }`}
            >
                {/* Mobile menu header */}
                <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-800">
                    <div className="flex items-center">
                        <div className="mr-2">
                            <Image 
                                src="/GazeIcon.png"
                                alt="fsGaze Logo"
                                width={20}
                                height={20}
                                className="size-5"
                            />
                        </div>
                        <span className="text-lg font-medium text-gray-800 dark:text-gray-200">fsGaze</span>
                    </div>
                    <button
                        className="rounded-md p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                        onClick={() => setIsMenuOpen(false)}
                    >
                        <HiX className="size-5" />
                    </button>
                </div>

                {/* Mobile menu items */}
                <div className="overflow-y-auto h-[calc(100%-4rem)] py-4 px-3">
                    {menuItems.map((item, index) => {
                        const isActive = item.type === 'link'
                            ? activeMenuItem === item.href
                            : item.items.some(subitem => activeMenuItem === subitem.href);

                        return (
                            <div key={index} className="mb-2">
                                {item.type === 'link' ? (
                                    <button
                                        onClick={() => handleNavigation(item.href, item.label)}
                                        className={`flex items-center px-4 py-2.5 text-sm rounded-lg transition-colors w-full text-left ${
                                            isActive
                                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                                                : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                                        }`}
                                    >
                                        <item.icon className="mr-3 size-5" />
                                        {item.label}
                                    </button>
                                ) : (
                                    <div className="mb-1">
                                        <button
                                            onClick={() => toggleGroup(item.label)}
                                            className={`flex w-full items-center justify-between px-4 py-2.5 text-sm rounded-lg transition-colors ${
                                                isActive 
                                                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                                                    : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                                            }`}
                                        >
                                            <div className="flex items-center">
                                                <item.icon className="mr-3 size-5" />
                                                {item.label}
                                            </div>
                                            <HiChevronDown 
                                                className={`size-4 transition-transform ${
                                                    expandedGroups[item.label] ? 'rotate-180' : ''
                                                }`} 
                                            />
                                        </button>
                                        
                                        {expandedGroups[item.label] && (
                                            <div className="mt-1 ml-6 pl-4 border-l border-gray-200 dark:border-gray-700">
                                                {item.items.map((subitem, subIndex) => {
                                                    const isSubitemActive = activeMenuItem === subitem.href;
                                                    return (
                                                        <button
                                                            key={subIndex}
                                                            onClick={() => {
                                                                if (subitem.isActive !== false) {
                                                                    handleNavigation(subitem.href, subitem.label);
                                                                }
                                                            }}
                                                            disabled={subitem.isActive === false}
                                                            className={`flex items-center px-3 py-2 text-sm rounded-lg my-0.5 w-full text-left ${
                                                                subitem.isActive === false
                                                                    ? 'text-gray-400 cursor-not-allowed'
                                                                    : isSubitemActive
                                                                        ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                                                                        : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                                                            }`}
                                                        >
                                                            {subitem.label}
                                                            {subitem.isActive === false && (
                                                                <span className="ml-2 text-xs text-gray-400">(soon)</span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Content padding for mobile */}
            <div className="md:hidden h-16"></div>

            {/* Content area */}
            <div className="flex-1">
                {/* Dark overlay when mobile menu is open */}
                {isMenuOpen && (
                    <div
                        className="fixed inset-0 z-30 bg-black bg-opacity-50 md:hidden"
                        onClick={() => setIsMenuOpen(false)}
                    ></div>
                )}
            </div>
        </div>
    );
}