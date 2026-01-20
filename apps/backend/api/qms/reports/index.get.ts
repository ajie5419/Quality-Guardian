import { defineEventHandler } from 'h3';

import { MOCK_DELAY, REPORTS_LIST } from '../../../utils';

export default defineEventHandler(async () => {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY));
  return {
    code: 0,
    data: REPORTS_LIST,
    message: 'ok',
  };
});
