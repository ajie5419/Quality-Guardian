import { defineEventHandler } from 'h3';

export default defineEventHandler(() => {
  return {
    message: 'Welcome to the QMS Mock API root',
    status: 'operational',
  };
});
