import type {QueryDraft,QueryFilter,QueryPage,QuerySelection} from '../QueryReportsTypes';
type Product={id:string;name:string;category?:string|null};
export function unrestrictedMaterials(filters:Record<string,QuerySelection>,fields:QueryFilter[]):boolean;
export function productSelected(product:Product,filters:Record<string,QuerySelection>,fields:QueryFilter[]):boolean;
export function selectionMatches(selection:QuerySelection|undefined,product:Product):boolean;
export function changeMaterialFilter(draft:QueryDraft,field:string,value:QuerySelection,fields:QueryFilter[],states:QueryPage['materialSelections']):QueryDraft;
export function toggleGalleryProduct(draft:QueryDraft,product:Product,fields:QueryFilter[],states:QueryPage['materialSelections']):QueryDraft;
export function restoreGalleryProducts(draft:QueryDraft):QueryDraft;
