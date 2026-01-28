export interface PageResult<T> {
  items: T[];
  total: number;
}

export interface User {
  createTime: string;
  deptId?: string;
  deptName?: string;
  email?: string;
  id: string;
  phone?: string;
  realName: string;
  remark?: string;
  roleIds?: string[];
  roles?: string[];
  status: number;
  username: string;
}

export interface Role {
  createTime: string;
  id: string;
  name: string;
  permissions?: string[];
  remark?: string;
  status: number;
  value: string;
}

export interface Dept {
  children?: Dept[];
  createTime: string;
  id: string;
  name: string;
  pid: string;
  remark?: string;
  status: number;
}

export interface Menu {
  children?: Menu[];
  component: string;
  id: string;
  meta: {
    hideMenu?: boolean;
    icon?: string;
    orderNo?: number;
    title: string;
  };
  name: string;
  path: string;
  pid: string;
  redirect?: string;
}
