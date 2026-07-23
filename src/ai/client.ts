import type { Environment } from '../config/env.js';
import { DisabledAiProvider, OpenAiCompatibleProvider, type AiProvider } from './provider.js';

export function createAiProvider(environment: Environment): AiProvider {
  if (environment.AI_PROVIDER !== 'openai-compatible') return new DisabledAiProvider();
  return new OpenAiCompatibleProvider({
    apiKey: environment.AI_API_KEY!,
    baseUrl: environment.AI_BASE_URL!,
    model: environment.AI_MODEL!,
  });
}
