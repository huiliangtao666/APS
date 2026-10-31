export type SharingProfile={contract:'B16-offline-sharing-v1';version:string;source:string;mock:true;lines:{id:string;factoryId:string}[];products:{productId:string;lineIds:string[]}[];resources:{type:'人员'|'工装';resourceId:string;factoryId:string;lineIds:string[];allowCrossLine:boolean;capacity:string;unit:'人'|'套'}[];materials:{materialId:string;factoryId:string;lineIds:string[]}[];selections:{orderId:string;mode:'specified'|'automatic';lineId?:string}[]};
export const sharingContract:'B16-offline-sharing-v1';
export function validateSharingProfile(profile:SharingProfile,data:Record<string,any[]>):any[];
export function lineCandidates(profile:SharingProfile,productId:string,selection:{mode:'specified'|'automatic';lineId?:string}):{status:'pass'|'problem';candidates:string[];reason?:string;basis?:string};
export function allocateSharingMaterials(input:{profile:SharingProfile;data:Record<string,any[]>;plan:any;conditions:any}):{status:'pass'|'problem';findings:any[];plan:any};
export function checkSharingPlan(input:{profile:SharingProfile;data:Record<string,any[]>;plan:any;conditions:any}):{contract:string;status:'pass'|'problem';findings:any[];checks:any;profile:SharingProfile;offlineOnly:true;applicationEnabled:false;qaUat:'NOT_EXECUTED';scope:string};
export function sharingMappingCsv(profile:SharingProfile):string;
