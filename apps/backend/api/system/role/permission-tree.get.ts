import { defineEventHandler, setResponseStatus } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import {
  ensureMetrologyMenu,
  ensureVehicleCommissioningMenu,
} from '~/utils/menu-bootstrap';
import prisma from '~/utils/prisma';
import {
  unAuthorizedResponse,
  useResponseError,
  useResponseSuccess,
} from '~/utils/response';

/**
 * 权限树接口 - 简化版
 * 核心逻辑：显示所有菜单节点，不做任何过滤
 */
export default defineEventHandler(async (event) => {
  const userinfo = await verifyAccessToken(event);
  if (!userinfo) return unAuthorizedResponse(event);

  try {
    await ensureVehicleCommissioningMenu();
    await ensureMetrologyMenu();

    // 1. 获取所有启用的菜单
    const allMenus = await prisma.menus.findMany({
      where: { isDeleted: false, status: 1 },
      orderBy: { order: 'asc' },
    });

    // 2. 解析菜单标题
    const getTitle = (metaStr: null | string): string => {
      if (!metaStr) return '未命名';
      try {
        const meta = JSON.parse(metaStr);
        return meta.title || '未命名';
      } catch {
        return '未命名';
      }
    };

    // 3. 获取类型标签
    const getTypeLabel = (type: string): string => {
      switch (type) {
        case 'button': {
          return '[按钮]';
        }
        case 'catalog': {
          return '[目录]';
        }
        case 'menu': {
          return '[页面]';
        }
        default: {
          return '';
        }
      }
    };

    // 4. 递归构建树 - 不做任何过滤，显示所有节点
    interface PermissionNode {
      title: string;
      key: string;
      menuId: string;
      type: string;
      children?: PermissionNode[];
    }

    const buildTree = (parentId: string = '0'): PermissionNode[] => {
      const children = allMenus.filter((m) => m.parentId === parentId);

      return children.map((menu) => {
        const title = getTitle(menu.meta);
        const typeLabel = getTypeLabel(menu.type);

        // 核心：每个节点都使用 authCode 作为 key（如果有）
        // 这样勾选时保存的就是权限码
        const node: PermissionNode = {
          title: `${typeLabel} ${title}`,
          // 如果有 authCode 就用它，没有就用 MENU_ID 前缀
          key: menu.authCode || `MENU_${menu.id}`,
          // 额外信息，方便调试
          menuId: menu.id,
          type: menu.type,
        };

        // 递归获取子节点
        const subChildren = buildTree(menu.id);
        if (subChildren.length > 0) {
          node.children = subChildren;
        }

        return node;
      });
    };

    const permissionTree = buildTree('0');

    console.warn(
      `[permission-tree] 返回 ${allMenus.length} 个菜单，树形节点数: ${JSON.stringify(permissionTree).length} bytes`,
    );

    return useResponseSuccess(permissionTree);
  } catch (error: unknown) {
    logApiError('permission-tree', error);
    setResponseStatus(event, 500);
    return useResponseError('Failed to fetch permission tree');
  }
});
