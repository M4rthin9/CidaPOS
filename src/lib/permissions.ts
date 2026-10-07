export const permissions = ['sell','orders.read','reports.read','products.create','catalog.write','users.write','settings.write','sales.reset','discount','void','refund','close','reopen','audit.read','export'] as const;
export type Permission = typeof permissions[number];
export const roles: Record<string, readonly Permission[]> = {
  SUPER_ADMIN: permissions,
  ADMIN: permissions.filter(p => p !== 'reopen' && p !== 'sales.reset'),
  MANAGER: ['sell','orders.read','reports.read','products.create','catalog.write','discount','void','refund','close','audit.read','export'],
  CASHIER: ['sell','products.create','reports.read'],
  ACCOUNTING: ['orders.read','reports.read','close','export'],
  VIEWER: ['orders.read','reports.read'],
};
export function can(role: string, permission: Permission) { return roles[role]?.includes(permission) ?? false; }
