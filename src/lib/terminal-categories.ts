import type {Catalog,Terminal} from './types';

/** An omitted assignment keeps existing terminals open to all categories. */
export function terminalSellsCategory(config:unknown,categoryId:string){
 const categoryIds=(config as {categoryIds?:string[]}|null)?.categoryIds;
 return categoryIds===undefined||Array.isArray(categoryIds)&&categoryIds.includes(categoryId);
}

export function catalogForTerminal(catalog:Catalog,terminal?:Terminal):Catalog{
 const categories=terminal?catalog.categories.filter(c=>terminalSellsCategory(terminal.config,c.id)):[];
 const categoryIds=new Set(categories.map(c=>c.id));
 return {...catalog,categories,products:catalog.products.filter(p=>categoryIds.has(p.categoryId))};
}
