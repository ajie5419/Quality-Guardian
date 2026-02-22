import { eventHandler } from 'h3';
import { logApiError } from '~/utils/api-logger';
import { verifyAccessToken } from '~/utils/jwt-utils';
import { ensureVehicleCommissioningMenu } from '~/utils/menu-bootstrap';
import prisma from '~/utils/prisma';
import { redis } from '~/utils/redis';
import { unAuthorizedResponse, useResponseSuccess } from '~/utils/response';

interface Menu {
  id: number | string;
  parentId?: null | number | string;
  name: string;
  type: 'button' | 'catalog' | 'menu';
  authCode?: string;
  order?: number;
  meta?: Record<string, unknown> | string;
  children?: Menu[];
  [key: string]: unknown;
}

/**
 * 将平铺的菜单数据转换为树形结构
 */
function buildMenuTree(menus: Menu[], parentId: string = '0'): Menu[] {
  const filtered = menus.filter((menu) => {
    const pid =
      !menu.parentId ||
      menu.parentId === null ||
      menu.parentId === undefined ||
      menu.parentId === '0' ||
      menu.parentId === 0
        ? '0'
        : String(menu.parentId);
    return pid === parentId;
  });

  if (parentId === '0' && filtered.length === 0 && menus.length > 0) {
    console.warn(
      `[Menu Debug] Root check failed. Sample parentId: '${menus[0].parentId}' Type: ${typeof menus[0].parentId}`,
    );
  }

  return filtered
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((menu) => {
      const children = buildMenuTree(menus, String(menu.id));
      const meta =
        typeof menu.meta === 'string' ? JSON.parse(menu.meta) : menu.meta;

      return {
        ...menu,
        meta,
        children: children.length > 0 ? children : undefined,
      };
    });
}

/**
 * 收集菜单及其所有子按钮的权限码
 */
function collectMenuAuthCodes(menu: Menu): string[] {
  const codes: string[] = [];
  if (menu.authCode) {
    codes.push(menu.authCode);
  }
  if (menu.children) {
    for (const child of menu.children) {
      codes.push(...collectMenuAuthCodes(child));
    }
  }
  return codes;
}

/**
 * 检查用户是否有权限访问菜单
 * 规则：用户拥有菜单本身的权限码 OR 菜单下任意子按钮的权限码
 */
function hasMenuAccess(menu: Menu, userCodesSet: Set<string>): boolean {
  // 如果菜单本身没有权限码要求，直接通过
  if (!menu.authCode && menu.type !== 'menu') {
    return true;
  }

  // 收集该菜单及其所有子节点的权限码
  const menuCodes = collectMenuAuthCodes(menu);

  // 只要用户拥有其中任意一个权限码，就允许访问
  return menuCodes.some((code) => userCodesSet.has(code));
}

/**
 * 递归过滤菜单 (针对侧边栏显示)
 */
function filterMenus(
  menus: Menu[],
  userCodesSet: Set<string>,
  skipAuthCheck = false,
): Menu[] {
  return menus
    .filter((menu) => {
      // 1. 过滤掉按钮类型 - 侧边栏不显示按钮
      if (menu.type === 'button') {
        return false;
      }

      // 2. 权限校验逻辑
      if (!skipAuthCheck && !hasMenuAccess(menu, userCodesSet)) {
        return false;
      }

      // 3. 递归处理子级
      if (menu.children && menu.children.length > 0) {
        const visibleChildren = filterMenus(
          menu.children,
          userCodesSet,
          skipAuthCheck,
        );
        menu.children = visibleChildren;

        // 如果是目录类型且没有任何可见的子页面，则该目录也应该隐藏
        if (menu.type === 'catalog' && visibleChildren.length === 0) {
          return false;
        }
      }

      return true;
    })
    .map((menu) => ({ ...menu }));
}

// ... imports

export default eventHandler(async (event) => {
  const userinfo = verifyAccessToken(event);
  if (!userinfo) {
    return unAuthorizedResponse(event);
  }

  const userId = userinfo.id ?? userinfo.userId;
  // Cache key: qms:menu:{userId}
  // We use userId because roles might change, but userId is stable for the session context
  // Actually, better to include roleId in key if user has multiple roles, but for now 1:1 or 1:N roles are bound to user
  const cacheKey = `qms:menu:${userId}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    console.warn(
      `[Menu Cache] HIT - User: ${userinfo.username}, Key: ${cacheKey}`,
    );
    return cached;
  }

  const result = await (async () => {
    await ensureVehicleCommissioningMenu();

    // 1. 获取所有状态正常的菜单
    const allDbMenus = (await prisma.menus.findMany({
      where: { isDeleted: false, status: 1 },
      orderBy: { order: 'asc' },
    })) as unknown as Menu[];

    // 2. 获取用户真实权限
    let userPermissions: string[] = [];
    let roleName = '';

    try {
      const dbUser = await prisma.users.findFirst({
        where: {
          OR: [{ id: String(userId) }, { username: userinfo.username }],
        },
        include: {
          roles: true,
        },
      });

      if (dbUser && dbUser.roles) {
        roleName = dbUser.roles.name;
        try {
          userPermissions = JSON.parse(dbUser.roles.permissions || '[]');
        } catch (error) {
          logApiError('all', error);
          userPermissions = [];
        }
      }
    } catch (error) {
      logApiError('all', error);
    }

    // 3. 构建完整树
    const fullMenuTree = buildMenuTree(allDbMenus);

    // 4. 执行过滤
    const isSuper =
      roleName.toLowerCase().includes('super') ||
      userPermissions.includes('*') ||
      userPermissions.includes('["*"]') ||
      userId === '1' ||
      userId === 'USR-ADMIN';

    // 将权限列表转为 Set 提高查询效率
    const userCodesSet = new Set(userPermissions);

    // 关键修复：即便为超级管理员，也必须调用 filterMenus 过滤掉 type === 'button' 的项
    // 否则 Vue Router 会因为按钮没有 path 字段而崩溃（path is null 报错）
    const filteredMenus = filterMenus(fullMenuTree, userCodesSet, isSuper);

    console.warn(
      `[Menu Cache] MISS - User: ${userinfo.username}, ID: ${userinfo.id}, Role: ${roleName}, IsSuper: ${isSuper}`,
    );

    return useResponseSuccess(filteredMenus);
  })();

  await redis.set(cacheKey, result, 3600 * 24);
  return result;
});
