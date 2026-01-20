import { defineEventHandler, readBody } from 'h3';

import { MOCK_DELAY, REPORTS_LIST } from '../../../utils';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const id = event.context.params?.id;
  if (!id) {
    return { code: -1, message: 'id required' };
  }
  const body = await readBody(event);
  const index = REPORTS_LIST.findIndex((item) => item.id === id);
  if (index !== -1) {
    REPORTS_LIST[index] = { ...REPORTS_LIST[index], ...body };
    return {
      code: 0,
      data: REPORTS_LIST[index],
      message: 'updated',
    };
  }
  return { code: -1, message: 'not found' };
});
