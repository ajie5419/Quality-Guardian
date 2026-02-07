import prisma from '~/utils/prisma';

export interface UserQueryParams {
  page?: number;
  pageSize?: number;
}

export interface CreateUserDto {
  username: string;
  realName: string;
  email?: string;
  phone?: string;
  deptId?: string;
  status?: number; // 1: ACTIVE, 0: INACTIVE
  roles?: string[];
  roleIds?: string[];
}

export interface UpdateUserDto {
  username?: string;
  realName?: string;
  email?: string;
  phone?: string;
  deptId?: string;
  department?: string; // Add this to fix the lint error
  status?: number;
  roles?: string[];
  roleIds?: string[];
}

export const UserService = {
  /**
   * Find all users with pagination
   */
  async findAll(params: UserQueryParams) {
    const { page = 1, pageSize = 20 } = params;
    const currentPage = Number(page);
    const currentPageSize = Number(pageSize);

    const where = { isDeleted: false };

    const [total, users] = await Promise.all([
      prisma.users.count({ where }),
      prisma.users.findMany({
        where,
        skip: (currentPage - 1) * currentPageSize,
        take: currentPageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          roles: true,
        },
      }),
    ]);

    // Get all departments for deptName lookup
    const departments = await prisma.departments.findMany({
      where: { isDeleted: false },
    });
    const deptMap = new Map(departments.map((d) => [d.id, d.name]));

    // Map to frontend structure
    const result = users.map((user) => ({
      ...user,
      userId: user.id,
      deptId: user.department,
      deptName: deptMap.get(user.department) || '',
      roleIds: [user.roleId],
      roles: user.roles?.name ? [user.roles.name] : [],
      status: user.status === 'ACTIVE' ? 1 : 0,
      createTime: user.createdAt
        ? new Date(user.createdAt).toLocaleString('zh-CN')
        : '',
      remark: '',
    }));

    return {
      items: result,
      total,
    };
  },

  /**
   * Create a new user
   */
  async create(data: CreateUserDto) {
    // Handle Role lookup
    const rolesArray = data.roles || data.roleIds;
    const roleIdOrName = rolesArray?.[0];
    let finalRoleId = 'ROLE-DEFAULT';

    if (roleIdOrName) {
      const role = await prisma.roles.findFirst({
        where: {
          OR: [{ id: String(roleIdOrName) }, { name: String(roleIdOrName) }],
        },
      });
      if (role) {
        finalRoleId = role.id;
      }
    }

    const statusEnum = data.status === 1 ? 'ACTIVE' : 'INACTIVE';

    const newUser = await prisma.users.create({
      data: {
        id: `user-${Date.now()}`,
        username: data.username,
        password: '$2a$10$placeholder', // Default placeholder
        realName: data.realName,
        email: data.email || '',
        phone: data.phone || '',
        department: data.deptId || 'Unknown',
        status: statusEnum,
        isDeleted: false,
        roleId: finalRoleId,
      },
    });

    return {
      ...newUser,
      deptId: newUser.department,
      roleIds: [newUser.roleId],
      status: newUser.status === 'ACTIVE' ? 1 : 0,
    };
  },

  /**
   * Update an existing user
   */
  async update(id: string, data: UpdateUserDto) {
    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (data.department || data.deptId)
      updateData.department = data.department || data.deptId;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.realName !== undefined) updateData.realName = data.realName;
    if (data.username !== undefined) updateData.username = data.username;

    // Handle Roles
    const rolesArray = data.roles || data.roleIds;
    if (rolesArray && rolesArray.length > 0) {
      const roleIdOrName = rolesArray[0];
      const role = await prisma.roles.findFirst({
        where: {
          OR: [{ id: String(roleIdOrName) }, { name: String(roleIdOrName) }],
        },
      });
      if (role) {
        updateData.roleId = role.id;
      }
    }

    if (data.status !== undefined) {
      updateData.status = data.status === 1 ? 'ACTIVE' : 'INACTIVE';
    }

    await prisma.users.update({
      where: { id },
      data: updateData,
    });
  },

  /**
   * Soft delete a user
   */
  async delete(id: string) {
    await prisma.users.update({
      where: { id },
      data: {
        isDeleted: true,
        updatedAt: new Date(),
      },
    });
  },
};
