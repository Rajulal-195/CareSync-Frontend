import type { Role } from '@/types';

export const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: '/admin',
  RECEPTIONIST: '/reception',
  DOCTOR: '/doctor',
};

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  RECEPTIONIST: 'Receptionist',
  DOCTOR: 'Doctor',
};
