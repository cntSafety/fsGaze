"use client";

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Layout, Menu, Drawer, Button, Switch } from 'antd';
import type { MenuProps } from 'antd';
import {
  HiHome, HiCloudDownload, HiMenuAlt2, HiLightningBolt, HiOutlineDocumentReport,
  HiOutlineCode, HiFastForward, HiChevronLeft, HiChevronRight
} from 'react-icons/hi';
import { SunOutlined, MoonOutlined } from '@ant-design/icons';
import { IconType } from 'react-icons';
import { useLoading } from './LoadingProvider';
import { useTheme } from './ThemeProvider';

// Original menu item types
type MenuItemDef = SimpleMenuItemDef | DropdownMenuItemDef;

interface SimpleMenuItemDef {
  type: 'link';
  label: string;
  href: string;
  icon: IconType;
  isActive?: boolean;
}

interface DropdownMenuItemDef {
  type: 'dropdown';
  label: string;
  icon: IconType;
  items: {
    label: string;
    href: string;
    isActive?: boolean;
  }[];
}

// Ant Design menu item type
type AntdMenuItem = Required<MenuProps>['items'][number];

// Menu structure definition
const menuItemsDef: MenuItemDef[] = [
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
        label: 'Software',
        icon: HiOutlineCode,
        items: [
            { label: 'ARXML Importer', href: '/arxml-importer', isActive: true },
            { label: 'SW Table', href: '/arxml-viewer', isActive: true },
            { label: 'SW Graph', href: '/arxml-graphViewer', isActive: true },
            { label: 'SW Flow', href: '/arxml-flowViewer', isActive: true },
            { label: 'SW Safety', href: '/arxml-safety', isActive: true },
            { label: 'Store / Load', href: '/arxml-safetyDataExchange', isActive: true },
            { label: 'Failure Chain', href: '/arxml-crossFM', isActive: true }
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
        icon: HiOutlineDocumentReport,
        items: [
            { label: 'Statistic for TBC', href: '/find-shared-signals', isActive: true }
        ]
    },
];

// Helper to transform our definition to what Ant Design's Menu expects
function getItem(
    label: React.ReactNode,
    key: React.Key,
    icon?: React.ReactNode,
    children?: AntdMenuItem[],
    type?: 'group',
): AntdMenuItem {
    return { key, icon, children, label, type } as AntdMenuItem;
}

const antdMenuItems: AntdMenuItem[] = menuItemsDef.map(item => {
    const Icon = item.icon;
    if (item.type === 'link') {
        return getItem(
            <Link href={item.href}>{item.label}</Link>,
            item.href,
            <Icon />
        );
    }
    return getItem(
        item.label,
        item.label, // Parent key
        <Icon />,
        item.items
            .filter(sub => sub.isActive !== false)
            .map(subItem => getItem(
                <Link href={subItem.href}>{subItem.label}</Link>,
                subItem.href
            ))
    );
});

// The new Navbar component that provides the entire app layout
export function Navbar({ children }: { children: React.ReactNode }) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    
    const router = useRouter();
    const pathname = usePathname();
    const { showLoading, hideLoading } = useLoading();
    const { themeMode, toggleTheme } = useTheme();

    useEffect(() => {
        setMounted(true);
        const savedCollapsedState = localStorage.getItem('fsGaze-sidebar-collapsed');
        if (savedCollapsedState) {
            setIsCollapsed(JSON.parse(savedCollapsedState));
        }
    }, []);

    const handleNavigation: MenuProps['onClick'] = (e) => {
        const domEvent = e.domEvent as React.MouseEvent<HTMLElement>;
        const href = e.key;

        // For regular left-clicks, let the custom handler manage navigation for a smooth experience
        if (!domEvent.metaKey && !domEvent.ctrlKey && !domEvent.shiftKey && domEvent.button === 0) {
            domEvent.preventDefault();
            
            const targetMenuItem = menuItemsDef
                .flatMap(i => i.type === 'dropdown' ? i.items : [i])
                .find(i => i.href === href);
            
            const label = targetMenuItem?.label || 'Page';
    
            showLoading(`Loading ${label}...`);
            router.push(href);
            if (mobileDrawerOpen) {
                setMobileDrawerOpen(false);
            }
            setTimeout(() => hideLoading(), 500);
        }
        // For special clicks (Cmd/Ctrl + click, middle-click), do nothing.
        // The <Link> component's default behavior will handle opening in a new tab.
    };

    const toggleCollapsed = () => {
        const newCollapsedState = !isCollapsed;
        setIsCollapsed(newCollapsedState);
        localStorage.setItem('fsGaze-sidebar-collapsed', JSON.stringify(newCollapsedState));
    };
    
    // Find the default open key based on the current path
    const defaultOpenKey = menuItemsDef
        .find(item => item.type === 'dropdown' && item.items.some(sub => sub.href === pathname))
        ?.label;

    if (!mounted) {
        // Render a placeholder or skeleton to avoid layout shifts and hydration errors
        return (
            <Layout style={{ minHeight: '100vh', visibility: 'hidden' }}>
                <Layout.Sider width={256} />
                <Layout>
                    <Layout.Content />
                </Layout>
            </Layout>
        );
    }
    
    const Logo = ({ collapsed }: { collapsed: boolean }) => {
        const logoSrc = themeMode === 'dark' ? '/fsGaze-logo-dark.svg' : '/fsGaze-logo-light.svg';
        
        return (
            <div 
                style={{
                    height: '64px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 16px',
                }}
            >
                {collapsed ? (
                    <div style={{ width: '32px', height: '32px' }}>
                        <Image src="/GazeIcon.png" alt="fsGaze Icon" width={32} height={32} priority />
                    </div>
                ) : (
                    <div style={{ width: '150px', height: '40px' }}>
                        <Image src={logoSrc} alt="fsGaze Logo" width={150} height={40} priority />
                    </div>
                )}
            </div>
        );
    };

    const AppMenu = () => (
        <Menu
            theme={themeMode === 'dark' ? 'dark' : 'light'}
            mode="inline"
            selectedKeys={[pathname]}
            defaultOpenKeys={defaultOpenKey ? [defaultOpenKey] : []}
            onClick={handleNavigation}
            items={antdMenuItems}
            style={{ borderRight: 0 }}
        />
    );

    const SiderFooter = () => (
        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
            <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
                {!isCollapsed && (
                    <Switch
                        checkedChildren={<SunOutlined />}
                        unCheckedChildren={<MoonOutlined />}
                        checked={themeMode === 'light'}
                        onChange={toggleTheme}
                    />
                )}
                <Button
                    type="default"
                    icon={isCollapsed ? <HiChevronRight className="size-6" /> : <HiChevronLeft className="size-6" />}
                    onClick={toggleCollapsed}
                    title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
                />
            </div>
        </div>
    );

    const siderWidth = isCollapsed ? 80 : 256;

    return (
        <Layout style={{ minHeight: '100vh' }}>
            <Layout.Sider
                theme={themeMode === 'dark' ? 'dark' : 'light'}
                width={siderWidth}
                collapsible
                collapsed={isCollapsed}
                onCollapse={setIsCollapsed}
                trigger={null}
                className="hidden md:flex flex-col"
                style={{
                    overflow: 'auto',
                    height: '100vh',
                    position: 'fixed',
                    left: 0,
                    top: 0,
                    bottom: 0,
                }}
            >
                <div className="flex flex-col h-full">
                    <Logo collapsed={isCollapsed} />
                    <div className="flex-1 overflow-y-auto">
                        <AppMenu />
                    </div>
                    <SiderFooter />
                </div>
            </Layout.Sider>

            <Layout>
                {/* Mobile Header and Drawer */}
                <Layout.Header className="md:hidden flex items-center justify-between p-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800">
                    <Button icon={<HiMenuAlt2 />} onClick={() => setMobileDrawerOpen(true)} />
                    <div className="w-8 h-8 flex items-center justify-center">
                        <Image src="/GazeIcon.png" alt="fsGaze Logo" width={20} height={20} priority />
                    </div>
                </Layout.Header>

                {/* Main content */}
                <Layout.Content style={{ marginLeft: siderWidth, transition: 'margin-left 0.2s' }}>
                    <main className="p-6">{children}</main>
                </Layout.Content>
                
                {/* Mobile Drawer */}
                <Drawer
                    title={<Logo collapsed={false} />}
                    placement="left"
                    onClose={() => setMobileDrawerOpen(false)}
                    open={mobileDrawerOpen}
                    width={256}
                    styles={{
                        header: { padding: 0, borderBottom: 'none' },
                        body: { padding: 0 }
                    }}
                >
                    <AppMenu />
                </Drawer>
            </Layout>
        </Layout>
    );
}