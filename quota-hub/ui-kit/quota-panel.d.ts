export type TierIcon = 'free' | 'pro' | 'ultra' | 'enterprise';

export interface QuotaItem {
  id: string;
  icon?: 'spark' | 'cluster';
  label: string;
  windowTag?: string;
  tags?: string[];
  remainingPercent: number | null;
  resetInText?: string;
  resetTone?: '5h' | 'weekly';
  fullWidth?: boolean;
  featured?: boolean;
}

export interface QuotaBadge {
  text: string;
  tone?: 'default' | 'accent' | 'purple' | 'emerald' | 'gold';
  icon?: TierIcon;
}

export interface QuotaGroup {
  id: string;
  source?: 'agy-snapshot' | 'direct-api';
  updatedAt?: number;
  title: string;
  accountEmail?: string;
  subtitle?: string;
  badges?: QuotaBadge[];
  items: QuotaItem[];
}

export type GlassVariant = 'frosted' | 'crystal' | 'wireframe';

export declare class QuotaPanelElement extends HTMLElement {
  data: QuotaGroup;
}

export declare function registerQuotaPanel(tagName?: string): void;
