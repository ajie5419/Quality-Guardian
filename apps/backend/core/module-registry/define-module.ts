import type { QmsModuleDefinition } from './types';

export function defineModule<T extends QmsModuleDefinition>(definition: T) {
  return definition;
}
