export function createInflightRequests():{
 read<T>(key:string,load:()=>T|Promise<T>):Promise<T>;
 invalidate():void;
};
