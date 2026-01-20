import { defineEventHandler } from 'h3';

import { MOCK_DELAY, REPORTS_LIST } from '../../../utils';

export default defineEventHandler(async (event) => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  const id = event.context.params?.id;
  if (!id) {
    return { code: -1, message: 'id required' };
  }
  const index = REPORTS_LIST.findIndex((item) => item.id === id);
  if (index !== -1) {
    REPORTS_LIST.splice(index, 1);
    return {
      code: 0,
      message: 'deleted',
    };
  }
  return { code: -1, message: 'not found' };
});
