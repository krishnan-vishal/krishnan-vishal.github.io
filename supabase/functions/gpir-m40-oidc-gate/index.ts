import { handleM40OIDC } from './handler.mjs';
Deno.serve(request => handleM40OIDC(request));
