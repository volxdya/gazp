export type Role = 'admin' | 'operator' | 'guest';

export const can = {
  runTwin: (r: Role) => r === 'admin' || r === 'operator',
  readJournal: (r: Role) => r === 'admin' || r === 'operator',
  manageUsers: (r: Role) => r === 'admin'
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Руководитель',
  operator: 'Диспетчер',
  guest: 'Экскурсант'
};
