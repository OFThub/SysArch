import {
  Bot,
  Box,
  ChartScatter,
  Database,
  Filter,
  FlaskConical,
  Gauge,
  Globe,
  KeyRound,
  Layers,
  Monitor,
  Network,
  Server,
  Sparkles,
  Table,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { ActuatorIcon, CommIcon, McuIcon, PowerIcon, SensorIcon, SbcIcon } from './hardware';

// Explicit map instead of lucide's full `icons` export, which would ship every icon.
const ICONS: Record<string, LucideIcon | typeof McuIcon> = {
  monitor: Monitor,
  server: Server,
  database: Database,
  zap: Zap,
  layers: Layers,
  'key-round': KeyRound,
  globe: Globe,
  network: Network,
  table: Table,
  filter: Filter,
  'flask-conical': FlaskConical,
  box: Box,
  sparkles: Sparkles,
  'chart-scatter': ChartScatter,
  bot: Bot,
  gauge: Gauge,
  'hw-mcu': McuIcon,
  'hw-sbc': SbcIcon,
  'hw-sensor': SensorIcon,
  'hw-actuator': ActuatorIcon,
  'hw-power': PowerIcon,
  'hw-comm': CommIcon,
};

/** Catalog icon by name; custom types with an unknown icon get a plain box. */
export function NodeIcon({ name, size = 16 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? Box;
  return <Icon size={size} strokeWidth={1.5} aria-hidden />;
}
