type ScopeRow = Record<string, string>;
type ScopeFinding = { code: string; message: string; taskIds: string[] };

export function validateSingleLineScope(orders: ScopeRow[], machines: ScopeRow[], original?:Record<string,ScopeRow[]>): ScopeFinding[];
