import {
  Monitor,
  Globe,
  Cloud,
  Scale,
  DoorOpen,
  Server,
  Boxes,
  Cog,
  Database,
  HardDrive,
  Layers,
  ListOrdered,
  Search,
} from 'lucide-react';

export const NODE_TYPES = [
  { type: 'client', label: 'Client', color: '#2563eb', Icon: Monitor },
  { type: 'dns', label: 'DNS', color: '#0891b2', Icon: Globe },
  { type: 'cdn', label: 'CDN', color: '#0d9488', Icon: Cloud },
  { type: 'loadBalancer', label: 'Load Balancer', color: '#7c3aed', Icon: Scale },
  { type: 'apiGateway', label: 'API Gateway', color: '#9333ea', Icon: DoorOpen },
  { type: 'apiServer', label: 'API Server', color: '#c026d3', Icon: Server },
  { type: 'service', label: 'Service', color: '#db2777', Icon: Boxes },
  { type: 'worker', label: 'Worker', color: '#ea580c', Icon: Cog },
  { type: 'cache', label: 'Cache', color: '#ca8a04', Icon: Layers },
  { type: 'database', label: 'Database', color: '#16a34a', Icon: Database },
  { type: 'objectStorage', label: 'Object Storage', color: '#15803d', Icon: HardDrive },
  { type: 'queue', label: 'Queue', color: '#b45309', Icon: ListOrdered },
  { type: 'searchIndex', label: 'Search Index', color: '#4f46e5', Icon: Search },
];

export const NODE_CONFIG_BY_TYPE = Object.fromEntries(
  NODE_TYPES.map((n) => [n.type, n])
);

export function defaultLabel(type) {
  return NODE_CONFIG_BY_TYPE[type]?.label || type;
}
