export type OrderRow = Record<string, string>;
export type OrderIssue = { code: string; table?:string;row?:number;relatedRecords?:import('./problem-records.mjs').RecordRef[];line: number; field: string; message: string };
export type OrderChange = { orderId: string; field: string; before: string; after: string; changedAt: string };
export function validateOrders(rows?: OrderRow[]): OrderIssue[];
export function appendOrderChange(history: OrderChange[], orderId: string, field: string, before: string, after: string, changedAt?: string): OrderChange[];
export function isOrderSchedulable(order: OrderRow): boolean;
export function preserveStartedOrCompletedTasks(tasks: Array<{ status?: string }>): Array<{ status?: string }>;
