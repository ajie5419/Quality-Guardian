import type { CreateDeptDto, UpdateDeptDto } from '~/modules/dept';

type DeptBody = {
  businessUnit?: string;
  description?: string;
  name?: string;
  orderNo?: number;
  parentId?: string;
  pid?: string;
  remark?: string;
  sort?: number;
  status?: number;
};

export function normalizeCreateDeptBody(body: DeptBody): CreateDeptDto {
  return {
    businessUnit: body.businessUnit,
    description: body.description ?? body.remark,
    name: String(body.name || ''),
    parentId: body.parentId ?? body.pid,
    sort: body.sort ?? body.orderNo,
    status: body.status,
  };
}

export function normalizeUpdateDeptBody(body: DeptBody): UpdateDeptDto {
  return {
    businessUnit: body.businessUnit,
    description: body.description ?? body.remark,
    name: body.name,
    parentId: body.parentId ?? body.pid,
    sort: body.sort ?? body.orderNo,
    status: body.status,
  };
}
