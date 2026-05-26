import { defineEventHandler, getRequestURL } from 'h3';
import { DataScopeService } from '~/modules/data-scope/data-scope.service';

const QMS_MODULE_PREFIXES = [
  { module: 'after-sales', prefix: '/api/qms/after-sales' },
  { module: 'inspection', prefix: '/api/qms/inspection' },
  { module: 'supplier', prefix: '/api/qms/supplier' },
  { module: 'work-order', prefix: '/api/qms/work-order' },
];

function getScopedModule(pathname: string) {
  return QMS_MODULE_PREFIXES.find(({ prefix }) => pathname.startsWith(prefix))
    ?.module;
}

export default defineEventHandler(async (event) => {
  const user = event.context.user;
  if (!user) return;

  const module = getScopedModule(getRequestURL(event).pathname);
  if (!module) return;

  const userId = String(user.id ?? user.userId ?? '');
  if (!userId) return;

  const scope = await DataScopeService.getScopeForModule(userId, module);
  event.context.dataScope = { ...scope, module };
});
