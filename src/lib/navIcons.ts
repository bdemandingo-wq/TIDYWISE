/**
 * Shared navigation icon registry.
 *
 * Single source of truth for every icon used in the TidyWise sidebar,
 * mobile sidebar, mobile bottom nav, mobile nav settings preview, and
 * the Capacitor iOS/Android app. Icons come exclusively from
 * `lucide-react` — do NOT introduce a second icon library, and do NOT
 * use emoji or inline SVGs for navigation.
 *
 * Consumers pick an icon by KEY (a stable string). Keys are stored in
 * `organization_mobile_nav_settings.icon_overrides` so a business can
 * customize any nav item's icon, and the choice syncs across devices.
 */
import {
  Home, Calendar, ClipboardList, Repeat, Users, Target, MapPin,
  MessageSquare, Briefcase, UserCircle, CheckSquare, Package,
  DollarSign, Receipt, BarChart3, Sparkles, CreditCard, HelpCircle,
  Tag, Activity, Brain, Globe, Zap, Camera, Gauge, Bug, Bell,
  Navigation, Settings, Plus, ListTodo, Megaphone, MessageCircle,
  Wrench, UsersRound, Percent, PieChart, FileText, CalendarDays,
  Crosshair, Image, Truck, Wallet, ShoppingCart, ChartBar, LineChart,
  Rocket, Star, ClipboardCheck, Building2, Handshake, Phone, Mail,
  Inbox, LayoutDashboard, ClipboardEdit, BookOpen, Clock, Timer,
  ShieldCheck, Award, Trophy, Flame, Heart, ThumbsUp,
  type LucideIcon,
} from 'lucide-react';

/**
 * Curated palette of icons the owner can pick from in
 * Settings → Navigation → Icon style. All lucide-react.
 */
export const NAV_ICON_LIBRARY: Record<string, LucideIcon> = {
  Home, LayoutDashboard, Calendar, CalendarDays, Clock, Timer,
  ClipboardList, ClipboardCheck, ClipboardEdit, CheckSquare, ListTodo,
  Repeat, Users, UsersRound, UserCircle, Target, Crosshair,
  MapPin, Navigation, Truck, MessageSquare, MessageCircle, Mail,
  Inbox, Phone, Megaphone, Bell, Briefcase, Building2, Handshake,
  Wrench, Package, ShoppingCart, Camera, Image, DollarSign, Wallet,
  CreditCard, Receipt, PieChart, BarChart3, ChartBar, LineChart,
  Percent, Tag, FileText, BookOpen, Brain, Sparkles, Rocket, Zap,
  Activity, Gauge, ShieldCheck, Award, Trophy, Flame, Star, Heart,
  ThumbsUp, Globe, HelpCircle, Bug, Settings, Plus,
};

export type NavIconKey = keyof typeof NAV_ICON_LIBRARY;

/**
 * Definition for every navigation item in the app. `id` is the stable
 * key used everywhere (icon overrides, saved order, hidden items on
 * mobile, etc). `defaultIconKey` MUST exist in NAV_ICON_LIBRARY.
 */
export interface NavItemDef {
  id: string;
  name: string;
  href: string;
  defaultIconKey: NavIconKey;
}

export const NAV_ITEMS: NavItemDef[] = [
  { id: 'dashboard',           name: 'Dashboard',          href: '/dashboard',                       defaultIconKey: 'Home' },
  { id: 'ai-intelligence',     name: 'AI Intelligence',    href: '/dashboard/ai-intelligence',       defaultIconKey: 'Brain' },
  { id: 'scheduler',           name: 'Scheduler',          href: '/dashboard/scheduler',             defaultIconKey: 'Calendar' },
  { id: 'tracking',            name: 'Tracking',           href: '/dashboard/tracking',              defaultIconKey: 'Navigation' },
  { id: 'bookings',            name: 'Bookings',           href: '/dashboard/bookings',              defaultIconKey: 'ClipboardList' },
  { id: 'recurring',           name: 'Recurring',          href: '/dashboard/recurring',             defaultIconKey: 'Repeat' },
  { id: 'customers',           name: 'Customers',          href: '/dashboard/customers',             defaultIconKey: 'Users' },
  { id: 'client-portal',       name: 'Client Portal',      href: '/dashboard/client-portal',         defaultIconKey: 'Globe' },
  { id: 'invoices',            name: 'Invoices',           href: '/dashboard/invoices',              defaultIconKey: 'Receipt' },
  { id: 'messages',            name: 'Messages',           href: '/dashboard/messages',              defaultIconKey: 'MessageSquare' },
  { id: 'tasks',               name: 'Tasks',              href: '/dashboard/tasks',                 defaultIconKey: 'CheckSquare' },
  { id: 'leads',               name: 'Leads',              href: '/dashboard/leads',                 defaultIconKey: 'Target' },
  { id: 'operations',          name: 'Operations',         href: '/dashboard/operations',            defaultIconKey: 'MapPin' },
  { id: 'campaigns',           name: 'Campaigns',          href: '/dashboard/campaigns',             defaultIconKey: 'Megaphone' },
  { id: 'feedback',            name: 'Feedback',           href: '/dashboard/feedback',              defaultIconKey: 'MessageCircle' },
  { id: 'services',            name: 'Services',           href: '/dashboard/services',              defaultIconKey: 'Briefcase' },
  { id: 'staff',               name: 'Staff',              href: '/dashboard/staff',                 defaultIconKey: 'UsersRound' },
  { id: 'checklists',          name: 'Checklists',         href: '/dashboard/checklists',            defaultIconKey: 'ClipboardCheck' },
  { id: 'booking-photos',      name: 'Booking Photos',     href: '/dashboard/booking-photos',        defaultIconKey: 'Camera' },
  { id: 'inventory',           name: 'Inventory',          href: '/dashboard/inventory',             defaultIconKey: 'Package' },
  { id: 'discounts',           name: 'Discounts',          href: '/dashboard/discounts',             defaultIconKey: 'Tag' },
  { id: 'payroll',             name: 'Payroll',            href: '/dashboard/payroll',               defaultIconKey: 'DollarSign' },
  { id: 'expenses',            name: 'Expenses',           href: '/dashboard/expenses',              defaultIconKey: 'Wallet' },
  { id: 'finance',             name: 'Finance',            href: '/dashboard/finance',               defaultIconKey: 'PieChart' },
  { id: 'reports',             name: 'Reports',            href: '/dashboard/reports',               defaultIconKey: 'BarChart3' },
  { id: 'benchmarks',          name: 'Benchmarks',         href: '/dashboard/benchmarks',            defaultIconKey: 'Gauge' },
  { id: 'notifications',       name: 'Notifications',      href: '/dashboard/notifications',         defaultIconKey: 'Bell' },
  { id: 'automation-center',   name: 'Automation Center',  href: '/dashboard/automation-center',     defaultIconKey: 'Zap' },
  { id: 'payment-integration', name: 'Payment Setup',      href: '/dashboard/payment-integration',   defaultIconKey: 'CreditCard' },
  { id: 'subscription',        name: 'Subscription',       href: '/dashboard/subscription',          defaultIconKey: 'CreditCard' },
  { id: 'settings',            name: 'Settings',           href: '/dashboard/settings',              defaultIconKey: 'Settings' },
  { id: 'help',                name: 'Help',               href: '/dashboard/help',                  defaultIconKey: 'HelpCircle' },
];

const NAV_ITEMS_BY_ID: Record<string, NavItemDef> =
  Object.fromEntries(NAV_ITEMS.map(i => [i.id, i]));

const NAV_ITEMS_BY_HREF: Record<string, NavItemDef> =
  Object.fromEntries(NAV_ITEMS.map(i => [i.href, i]));

export function getNavItemById(id: string): NavItemDef | undefined {
  return NAV_ITEMS_BY_ID[id];
}

export function getNavItemByHref(href: string): NavItemDef | undefined {
  return NAV_ITEMS_BY_HREF[href];
}

/** Resolve a component from a key, falling back to a safe default. */
export function getNavIconComponent(
  key: string | undefined | null,
  fallback: LucideIcon = Home,
): LucideIcon {
  if (!key) return fallback;
  return NAV_ICON_LIBRARY[key] ?? fallback;
}

/**
 * Resolve the icon for a nav item, honoring the org's overrides map
 * (nav id → icon key). Falls back to the item's default.
 */
export function resolveNavIcon(
  item: Pick<NavItemDef, 'id' | 'defaultIconKey'>,
  overrides?: Record<string, string> | null,
): LucideIcon {
  const key = overrides?.[item.id] ?? item.defaultIconKey;
  return getNavIconComponent(key, NAV_ICON_LIBRARY[item.defaultIconKey]);
}
