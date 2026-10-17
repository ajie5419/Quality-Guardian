import { defineEventHandler } from 'h3';
import { handleIdentityClientLookup } from '~/modules/identity-bridge';

export default defineEventHandler((event) => handleIdentityClientLookup(event));
