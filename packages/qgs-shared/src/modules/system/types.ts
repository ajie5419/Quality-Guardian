export interface PageResult<T> {
  items: T[];
  total: number;
}

export interface User {
  id: string;
  username: string;
  realName: string;
  email?: string;
  phone?: string;
  deptId?: string;
  deptName?: string;
  roleIds?: string[];
  roles?: string[];
  status: number;
  createTime: string;
  remark?: string;
}

export interface Role {
  id: string;
  name: string;
  value: string;
  status: number;
  createTime: string;
  remark?: string;
  permissions?: string[];
}

export interface Dept {
  id: string;
  pid: string;
  name: string;
  status: number;
  createTime: string;
  remark?: string;
  children?: Dept[];
}

export interface Menu {
  id: string;
  pid: string;
  path: string;
  name: string;
  component: string;
  redirect?: string;
  meta: {
    hideMenu?: boolean;
    icon?: string;
    orderNo?: number;
    title: string;
  };
  children?: Menu[];
}
