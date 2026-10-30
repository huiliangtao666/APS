// QA build alias only. This is a declared fixture, never a gateway identity.
export const getAuthState = async () => ({state:'authenticated',subject:'fr033-synthetic-planner'});
export const apiPath = p => p;
export const applyPraetorRuntime = () => {};
export const login = () => { throw new Error('Disposable validation has no platform login'); };
export const logout = async () => ({state:'unauthenticated'});
