export interface Application {
  id: number;
  number: string;
  status: string;
  owner_id: string;
  owner_name?: string;
  email: string;
  phone: string;
  project_name: string;
  project_details: string;
  project_description: string;
  project_duration: number;
  org_name: string;
  org_director: string;
  org_inn: string;
  org_ogrn: string;
  org_reg_date: string;
  created_at: string;
  updated_at: string;
}

export type Role = 'admin' | 'applicant' | 'reviewer';

export const roleLabels: Record<Role, string> = {
  admin: 'Администратор',
  applicant: 'Заявитель',
  reviewer: 'Проверяющий',
};
